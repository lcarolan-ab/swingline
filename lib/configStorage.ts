import type { FrpPageInfo } from "@/lib/extractFrpSections";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SavedConfig {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clientName: string;
  periodDateRaw: string;
  coverId: string | null;
  files: SavedFileEntry[];
  extractions: Record<string, FrpPageInfo[]>;
  sectionOverrides: Record<string, Array<{ sectionId: string; enabled: boolean }>>;
}

export interface SavedFileEntry {
  id: string;
  originalName: string;
  sectionName: string;
  isFrp: boolean;
  fileSize: number;
}

interface SavedBlob {
  key: string; // "${configId}/${fileId}"
  data: ArrayBuffer;
  name: string;
  type: string;
}

export interface ConfigSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = "stapler-configs";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("configs")) {
        db.createObjectStore("configs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

// ── CRUD operations ──────────────────────────────────────────────────────────

export async function saveConfig(
  config: SavedConfig,
  files: Array<{ id: string; file: File }>,
): Promise<void> {
  // Read all file data BEFORE opening the IDB transaction.
  // Awaiting file.arrayBuffer() inside an active transaction causes it to
  // auto-commit (no pending IDB requests while the async read is in-flight),
  // which makes subsequent puts fail with TransactionInactiveError.
  const fileData: Array<{ id: string; data: ArrayBuffer; name: string; type: string }> = [];
  for (const { id, file } of files) {
    fileData.push({ id, data: await file.arrayBuffer(), name: file.name, type: file.type });
  }

  const db = await openDB();
  const tx = db.transaction(["configs", "blobs"], "readwrite");
  const configStore = tx.objectStore("configs");
  const blobStore = tx.objectStore("blobs");

  configStore.put(config);

  // Delete old blobs for this config, then write new ones.
  // We iterate all keys in the blob store and delete matching ones.
  const blobCursor = blobStore.openCursor();
  await new Promise<void>((resolve, reject) => {
    blobCursor.onsuccess = () => {
      const cursor = blobCursor.result;
      if (!cursor) { resolve(); return; }
      if ((cursor.key as string).startsWith(`${config.id}/`)) {
        cursor.delete();
      }
      cursor.continue();
    };
    blobCursor.onerror = () => reject(blobCursor.error);
  });

  // Write new blobs synchronously within the transaction (no awaits).
  for (const { id, data, name, type } of fileData) {
    const blob: SavedBlob = {
      key: `${config.id}/${id}`,
      data,
      name,
      type,
    };
    blobStore.put(blob);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listConfigs(): Promise<ConfigSummary[]> {
  const db = await openDB();
  const tx = db.transaction("configs", "readonly");
  const store = tx.objectStore("configs");

  return new Promise<ConfigSummary[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const configs = (request.result as SavedConfig[])
        .map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          fileCount: c.files.length,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(configs);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadConfig(
  configId: string,
): Promise<{ config: SavedConfig; files: Array<{ id: string; file: File }> } | null> {
  const db = await openDB();

  // Read the config record
  const config = await new Promise<SavedConfig | undefined>((resolve, reject) => {
    const tx = db.transaction("configs", "readonly");
    const request = tx.objectStore("configs").get(configId);
    request.onsuccess = () => resolve(request.result as SavedConfig | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!config) return null;

  // Read the file blobs
  const files: Array<{ id: string; file: File }> = [];
  for (const entry of config.files) {
    const blob = await new Promise<SavedBlob | undefined>((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const request = tx.objectStore("blobs").get(`${configId}/${entry.id}`);
      request.onsuccess = () => resolve(request.result as SavedBlob | undefined);
      request.onerror = () => reject(request.error);
    });
    if (blob) {
      files.push({
        id: entry.id,
        file: new File([blob.data], blob.name, { type: blob.type }),
      });
    }
  }

  return { config, files };
}

export async function deleteConfig(configId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(["configs", "blobs"], "readwrite");

  tx.objectStore("configs").delete(configId);

  // Delete all blobs belonging to this config
  const blobStore = tx.objectStore("blobs");
  const blobCursor = blobStore.openCursor();
  await new Promise<void>((resolve, reject) => {
    blobCursor.onsuccess = () => {
      const cursor = blobCursor.result;
      if (!cursor) { resolve(); return; }
      if ((cursor.key as string).startsWith(`${configId}/`)) {
        cursor.delete();
      }
      cursor.continue();
    };
    blobCursor.onerror = () => reject(blobCursor.error);
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
