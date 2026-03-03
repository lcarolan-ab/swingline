"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveConfig as dbSave,
  listConfigs,
  loadConfig as dbLoad,
  deleteConfig as dbDelete,
} from "@/lib/configStorage";
import type { SavedConfig, ConfigSummary } from "@/lib/configStorage";
import type { PdfFile } from "@/components/PdfMerger";
import type { FrpPageInfo, FrpSection } from "@/lib/extractFrpSections";

interface ConfigManagerProps {
  pdfFiles: PdfFile[];
  coverId: string | null;
  clientName: string;
  periodDateRaw: string;
  extractions: Record<string, FrpPageInfo[]>;
  sectionsByPdf: Record<string, FrpSection[]>;
  currentConfigId: string | null;
  currentConfigName: string | null;
  onRestore: (state: {
    pdfFiles: PdfFile[];
    coverId: string | null;
    clientName: string;
    periodDateRaw: string;
    extractions: Record<string, FrpPageInfo[]>;
    sectionOverrides: Record<string, Array<{ sectionId: string; enabled: boolean }>>;
  }) => void;
  onConfigChange: (id: string | null, name: string | null) => void;
}

type Dialog = "save" | "load" | null;
type Confirm = { type: "load" | "delete"; id: string; name: string } | null;

export default function ConfigManager({
  pdfFiles,
  coverId,
  clientName,
  periodDateRaw,
  extractions,
  sectionsByPdf,
  currentConfigId,
  currentConfigName,
  onRestore,
  onConfigChange,
}: ConfigManagerProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      setConfigs(await listConfigs());
    } catch {
      /* indexedDB unavailable */
    }
  }, []);

  // Refresh config list when a dialog opens
  useEffect(() => {
    if (dialog) refreshList();
  }, [dialog, refreshList]);

  // Auto-suggest a save name
  useEffect(() => {
    if (dialog === "save") {
      if (currentConfigName) {
        setSaveName(currentConfigName);
      } else {
        const parts = [clientName.trim(), periodDateRaw].filter(Boolean);
        setSaveName(parts.join(" ") || "");
      }
    }
  }, [dialog, clientName, periodDateRaw, currentConfigName]);

  const closeDialog = () => {
    setDialog(null);
    setError(null);
    setConfirm(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeDialog();
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async (overwriteId?: string) => {
    const name = saveName.trim();
    if (!name) { setError("Enter a name for this configuration."); return; }
    if (pdfFiles.length === 0) { setError("Add at least one PDF before saving."); return; }

    setIsSaving(true);
    setError(null);
    try {
      const id = overwriteId ?? currentConfigId ?? crypto.randomUUID();
      const now = Date.now();

      const sectionOverrides: SavedConfig["sectionOverrides"] = {};
      for (const [pdfId, sections] of Object.entries(sectionsByPdf)) {
        sectionOverrides[pdfId] = sections.map((s) => ({
          sectionId: s.id,
          enabled: s.enabled,
        }));
      }

      // Preserve the original creation timestamp when overwriting an existing config
      const existingConfig = configs.find((c) => c.id === id);

      const config: SavedConfig = {
        id,
        name,
        createdAt: existingConfig ? existingConfig.createdAt : now,
        updatedAt: now,
        clientName,
        periodDateRaw,
        coverId,
        files: pdfFiles.map((f) => ({
          id: f.id,
          originalName: f.file.name,
          sectionName: f.sectionName,
          isFrp: f.isFrp,
          fileSize: f.file.size,
        })),
        extractions,
        sectionOverrides,
      };

      await dbSave(config, pdfFiles.map((f) => ({ id: f.id, file: f.file })));
      onConfigChange(id, name);
      closeDialog();
    } catch (err) {
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        setError("Not enough storage space. Try deleting old configurations.");
      } else {
        setError("Failed to save configuration.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  const handleLoad = async (configId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await dbLoad(configId);
      if (!result) { setError("Configuration not found."); return; }

      const { config, files } = result;
      const fileMap = new Map(files.map((f) => [f.id, f.file]));

      const restoredFiles: PdfFile[] = config.files
        .filter((entry) => fileMap.has(entry.id))
        .map((entry) => ({
          id: entry.id,
          file: fileMap.get(entry.id)!,
          sectionName: entry.sectionName,
          isFrp: entry.isFrp,
        }));

      onRestore({
        pdfFiles: restoredFiles,
        coverId: config.coverId,
        clientName: config.clientName,
        periodDateRaw: config.periodDateRaw,
        extractions: config.extractions,
        sectionOverrides: config.sectionOverrides,
      });
      onConfigChange(config.id, config.name);
      closeDialog();
    } catch {
      setError("Failed to load configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (configId: string) => {
    try {
      await dbDelete(configId);
      if (currentConfigId === configId) onConfigChange(null, null);
      await refreshList();
      setConfirm(null);
    } catch {
      setError("Failed to delete configuration.");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const hasFiles = pdfFiles.length > 0;

  return (
    <>
      {/* Toolbar buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDialog("save")}
          disabled={!hasFiles}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save
        </button>
        <button
          onClick={() => setDialog("load")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Load
        </button>
      </div>

      {/* Modal backdrop + dialog */}
      {dialog && (
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        >
          <div className="w-full max-w-md mx-4 bg-white rounded-xl border border-stone-200 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-800">
                {dialog === "save" ? "Save Configuration" : "Saved Configurations"}
              </h2>
              <button
                onClick={closeDialog}
                className="w-6 h-6 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {error && (
                <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {dialog === "save" && (
                <SavePanel
                  saveName={saveName}
                  setSaveName={setSaveName}
                  isSaving={isSaving}
                  configs={configs}
                  currentConfigId={currentConfigId}
                  onSave={handleSave}
                />
              )}

              {dialog === "load" && (
                <LoadPanel
                  configs={configs}
                  isLoading={isLoading}
                  confirm={confirm}
                  hasUnsavedWork={hasFiles}
                  onLoad={(id, name) => {
                    if (hasFiles) {
                      setConfirm({ type: "load", id, name });
                    } else {
                      handleLoad(id);
                    }
                  }}
                  onConfirmLoad={(id) => { setConfirm(null); handleLoad(id); }}
                  onDelete={(id, name) => setConfirm({ type: "delete", id, name })}
                  onConfirmDelete={(id) => handleDelete(id)}
                  onCancelConfirm={() => setConfirm(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Save Panel ───────────────────────────────────────────────────────────────

function SavePanel({
  saveName,
  setSaveName,
  isSaving,
  configs,
  currentConfigId,
  onSave,
}: {
  saveName: string;
  setSaveName: (v: string) => void;
  isSaving: boolean;
  configs: ConfigSummary[];
  currentConfigId: string | null;
  onSave: (overwriteId?: string) => void;
}) {
  const matchingConfig = configs.find(
    (c) => c.name.toLowerCase() === saveName.trim().toLowerCase() && c.id !== currentConfigId,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">
          Configuration Name
        </label>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="e.g. Davis Q4 2025"
          className="px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-[#0083d5]/40 focus:border-[#0083d5]"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
        />
      </div>

      {matchingConfig && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          A configuration named &ldquo;{matchingConfig.name}&rdquo; already exists.
          Saving will overwrite it.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => onSave(matchingConfig?.id)}
          disabled={isSaving || !saveName.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0083d5] hover:bg-[#174274] disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Load Panel ───────────────────────────────────────────────────────────────

function LoadPanel({
  configs,
  isLoading,
  confirm,
  hasUnsavedWork,
  onLoad,
  onConfirmLoad,
  onDelete,
  onConfirmDelete,
  onCancelConfirm,
}: {
  configs: ConfigSummary[];
  isLoading: boolean;
  confirm: Confirm;
  hasUnsavedWork: boolean;
  onLoad: (id: string, name: string) => void;
  onConfirmLoad: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelConfirm: () => void;
}) {
  if (configs.length === 0) {
    return (
      <p className="text-sm text-stone-400 text-center py-6">
        No saved configurations yet.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto -mx-1 px-1">
      {configs.map((c) => {
        const isConfirmingLoad = confirm?.type === "load" && confirm.id === c.id;
        const isConfirmingDelete = confirm?.type === "delete" && confirm.id === c.id;

        return (
          <div
            key={c.id}
            className="rounded-lg border border-stone-100 bg-stone-50/50 p-3"
          >
            <p className="text-sm font-medium text-stone-800">{c.name}</p>
            <p className="text-xs text-stone-400 mt-0.5">
              {c.fileCount} file{c.fileCount !== 1 ? "s" : ""} · Saved{" "}
              {formatRelativeTime(c.updatedAt)}
            </p>

            {/* Confirmation for load */}
            {isConfirmingLoad && (
              <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">
                  Loading will replace your current workspace. Continue?
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onCancelConfirm}
                    className="px-2.5 py-1 rounded text-xs text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onConfirmLoad(c.id)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded text-xs font-medium text-white bg-[#0083d5] hover:bg-[#174274] disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? "Loading…" : "Load"}
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation for delete */}
            {isConfirmingDelete && (
              <div className="mt-2 p-2 rounded-md bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">
                  Delete &ldquo;{c.name}&rdquo;? This cannot be undone.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onCancelConfirm}
                    className="px-2.5 py-1 rounded text-xs text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onConfirmDelete(c.id)}
                    className="px-2.5 py-1 rounded text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons (hidden during confirmation) */}
            {!isConfirmingLoad && !isConfirmingDelete && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onLoad(c.id, c.name)}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded text-xs font-medium text-[#0083d5] border border-[#0083d5]/30 hover:bg-[#0083d5]/5 disabled:opacity-50 transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => onDelete(c.id, c.name)}
                  className="px-2.5 py-1 rounded text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
