"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { buildPerformanceBook } from "@/lib/mergePdfs";
import type { SectionFrpData } from "@/lib/mergePdfs";
import { extractFrpPageInfo, groupFrpSections } from "@/lib/extractFrpSections";
import type { FrpPageInfo, FrpSection } from "@/lib/extractFrpSections";
import PdfCard from "@/components/PdfCard";

export interface PdfFile {
  id: string;
  file: File;
  sectionName: string;
  isFrp: boolean;
}

export default function PdfMerger() {
  const [pdfFiles, setPdfFiles]       = useState<PdfFile[]>([]);
  const [coverId, setCoverId]         = useState<string | null>(null);
  const [clientName, setClientName]     = useState("");
  const [periodDateRaw, setPeriodDateRaw] = useState(""); // YYYY-MM-DD from <input type="date">
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isBuilding, setIsBuilding]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── per-PDF extraction state ──────────────────────────────────────────────
  const [extractions, setExtractions] = useState<Record<string, FrpPageInfo[]>>({});
  const [sectionsByPdf, setSectionsByPdf] = useState<Record<string, FrpSection[]>>({});
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── file management ────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const isFirstUpload = !coverId;
    const newFiles: PdfFile[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((file, i) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        sectionName: file.name.replace(/\.pdf$/i, ""),
        // Auto-mark the very first file as FRP (it also becomes the cover)
        isFrp: isFirstUpload && i === 0,
      }));

    if (newFiles.length === 0) {
      setError("Only PDF files are supported.");
      return;
    }
    setError(null);
    setPdfFiles((prev) => {
      const next = [...prev, ...newFiles];
      if (isFirstUpload) setCoverId(newFiles[0].id);
      return next;
    });

    // Only extract for files marked as FRP on creation (i.e. the auto-cover)
    for (const pf of newFiles) {
      if (pf.isFrp) startExtraction(pf);
    }
  }, [coverId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── extraction helper ─────────────────────────────────────────────────────
  const startExtraction = useCallback((pf: PdfFile) => {
    if (extractions[pf.id]) return; // already extracted
    setExtractingIds((prev) => new Set(prev).add(pf.id));
    extractFrpPageInfo(pf.file)
      .then((info) => {
        setExtractions((prev) => ({ ...prev, [pf.id]: info }));
      })
      .catch(() => { /* treated as non-FRP */ })
      .finally(() => {
        setExtractingIds((prev) => {
          const next = new Set(prev);
          next.delete(pf.id);
          return next;
        });
      });
  }, [extractions]);

  // ── re-derive sections when extractions, coverId, or isFrp flags change ──
  const frpIds = pdfFiles.filter((f) => f.isFrp).map((f) => f.id);
  useEffect(() => {
    setSectionsByPdf((prev) => {
      const next: Record<string, FrpSection[]> = {};
      for (const id of frpIds) {
        const info = extractions[id];
        if (!info) continue;
        const isCover  = id === coverId;
        const startIdx = isCover ? 1 : 0;
        const newSections = groupFrpSections(info, startIdx);

        // Preserve enabled/disabled state from previous render
        const prevSections = prev[id];
        if (prevSections) {
          const stateMap = new Map(
            prevSections.map((s) => [`${s.reportTitle}|${s.portfolioName}`, s.enabled]),
          );
          for (const s of newSections) {
            const prevEnabled = stateMap.get(`${s.reportTitle}|${s.portfolioName}`);
            if (prevEnabled !== undefined) s.enabled = prevEnabled;
          }
        }

        next[id] = newSections;
      }
      return next;
    });
  }, [extractions, coverId, frpIds.join(",")]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { addFiles(e.target.files); e.target.value = ""; }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingOver(false); addFiles(e.dataTransfer.files);
  };
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPdfFiles((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeFile = (id: string) => {
    setPdfFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (id === coverId) setCoverId(next[0]?.id ?? null);
      return next;
    });
    // Clean up extraction data
    setExtractions((prev) => { const { [id]: _, ...rest } = prev; return rest; });
    setSectionsByPdf((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  };

  const renameSection = (id: string, name: string) => {
    setPdfFiles((prev) => prev.map((f) => f.id === id ? { ...f, sectionName: name } : f));
  };

  const handleSetCover = (id: string) => {
    setCoverId(id);
    // Setting as cover implies FRP — mark it and kick off extraction
    setPdfFiles((prev) => prev.map((f) => f.id === id ? { ...f, isFrp: true } : f));
    const pf = pdfFiles.find((f) => f.id === id);
    if (pf) startExtraction(pf);
  };

  const handleToggleFrp = (id: string) => {
    setPdfFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (!file) return prev;
      const willBeFrp = !file.isFrp;
      if (willBeFrp) startExtraction(file);
      return prev.map((f) => f.id === id ? { ...f, isFrp: willBeFrp } : f);
    });
  };

  const toggleSection = (pdfId: string, sectionId: string) => {
    setSectionsByPdf((prev) => ({
      ...prev,
      [pdfId]: (prev[pdfId] ?? []).map((s) =>
        s.id === sectionId ? { ...s, enabled: !s.enabled } : s,
      ),
    }));
  };

  /** Converts "YYYY-MM-DD" → "December 31, 2025" */
  const formatPeriodDate = (raw: string): string => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  };

  const handleClear = () => {
    setPdfFiles([]);
    setCoverId(null);
    setError(null);
    setExtractions({});
    setSectionsByPdf({});
  };

  // ── build ──────────────────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!coverId) { setError("Designate one PDF as the cover (FRP) source."); return; }
    if (!clientName.trim()) { setError("Enter a client name."); return; }
    if (!periodDateRaw)     { setError("Enter a period ending date."); return; }

    const coverIndex = pdfFiles.findIndex((f) => f.id === coverId);

    setIsBuilding(true);
    setError(null);
    try {
      // Build the per-section FRP data map from extraction + section toggles.
      const frpData = new Map<number, SectionFrpData>();

      for (let i = 0; i < pdfFiles.length; i++) {
        const pf       = pdfFiles[i];
        if (!pf.isFrp) continue;
        const pageInfo = extractions[pf.id];
        const sections = sectionsByPdf[pf.id];
        if (!pageInfo || !sections || sections.length === 0) continue;

        const includedPages = new Set<number>();
        for (const s of sections) {
          if (!s.enabled) continue;
          for (let idx = s.startIdx; idx <= s.endIdx; idx++) includedPages.add(idx);
        }
        frpData.set(i, { pageInfo, includedPages });
      }

      const bytes = await buildPerformanceBook(
        pdfFiles.map((f) => ({ file: f.file, name: f.sectionName })),
        coverIndex,
        { clientName: clientName.trim(), periodDate: formatPeriodDate(periodDateRaw) },
        frpData.size > 0 ? frpData : undefined,
      );
      const buf  = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      const blob = new Blob([buf], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "performance-book.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to build the book. Make sure all files are valid PDFs.");
    } finally {
      setIsBuilding(false);
    }
  };

  const hasFiles   = pdfFiles.length > 0;
  const canBuild   = hasFiles && !!coverId && !!clientName.trim() && !!periodDateRaw;

  return (
    <div
      className="relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-20 rounded-2xl border-2 border-blue-400 bg-blue-50/80 flex items-center justify-center pointer-events-none">
          <p className="text-blue-600 font-semibold text-lg">Drop PDFs to add them</p>
        </div>
      )}

      {/* ── Metadata form ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Client Name</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Nathan & Janet Davis"
            className="px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Period Ending</label>
          <input
            type="date"
            value={periodDateRaw}
            onChange={(e) => setPeriodDateRaw(e.target.value)}
            className="px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add PDFs
          </button>
          {hasFiles && (
            <span className="text-sm text-stone-400">
              {pdfFiles.length} file{pdfFiles.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasFiles && (
            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={handleBuild}
            disabled={!canBuild || isBuilding}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed transition-colors"
          >
            {isBuilding ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Building…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Build Book
              </>
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Error */}
      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {/* Cover hint */}
      {hasFiles && !coverId && (
        <p className="mb-4 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Click the bookmark icon on the FRP card to designate it as the cover source.
        </p>
      )}

      {/* Empty state */}
      {!hasFiles && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/60 py-24 text-center cursor-pointer hover:border-stone-300 hover:bg-stone-50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-stone-700">Drop PDFs here or click to browse</p>
            <p className="text-xs text-stone-400 mt-1">Add your FRP and supporting reports, then build</p>
          </div>
        </div>
      )}

      {/* Card grid */}
      {hasFiles && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pdfFiles.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {pdfFiles.map((pdf, index) => (
                <PdfCard
                  key={pdf.id}
                  pdf={pdf}
                  index={index}
                  isCover={pdf.id === coverId}
                  isFrp={pdf.isFrp}
                  sections={pdf.isFrp ? (sectionsByPdf[pdf.id] ?? []) : []}
                  isExtracting={pdf.isFrp && extractingIds.has(pdf.id)}
                  onRemove={removeFile}
                  onRename={renameSection}
                  onSetCover={handleSetCover}
                  onToggleFrp={handleToggleFrp}
                  onToggleSection={(sectionId) => toggleSection(pdf.id, sectionId)}
                />
              ))}

              {/* Add more card */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 aspect-[3/4] text-stone-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/40 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs font-medium">Add more</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
