"use client";

import { useState, useRef, useCallback } from "react";
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
import { mergePdfs } from "@/lib/mergePdfs";
import PdfCard from "@/components/PdfCard";

export interface PdfFile {
  id: string;
  file: File;
}

export default function PdfMerger() {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: PdfFile[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
      }));

    if (newFiles.length === 0) {
      setError("Only PDF files are supported.");
      return;
    }
    setError(null);
    setPdfFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the entire container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
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
    setPdfFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleMerge = async () => {
    if (pdfFiles.length < 2) {
      setError("Add at least 2 PDFs to merge.");
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      const merged = await mergePdfs(pdfFiles.map((p) => p.file));
      const arrayBuffer = new ArrayBuffer(merged.byteLength);
      new Uint8Array(arrayBuffer).set(merged);
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stapled.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to merge PDFs. Make sure all files are valid PDFs.");
    } finally {
      setIsMerging(false);
    }
  };

  const hasFiles = pdfFiles.length > 0;

  return (
    <div
      className="relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Global drag-over overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-20 rounded-2xl border-2 border-blue-400 bg-blue-50/80 flex items-center justify-center pointer-events-none">
          <p className="text-blue-600 font-semibold text-lg">Drop PDFs to add them</p>
        </div>
      )}

      {/* Toolbar */}
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
              onClick={() => setPdfFiles([])}
              className="px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={handleMerge}
            disabled={pdfFiles.length < 2 || isMerging}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed transition-colors"
          >
            {isMerging ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Merging…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Merge & Download
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
            <p className="text-xs text-stone-400 mt-1">Add as many as you need, then reorder and merge</p>
          </div>
        </div>
      )}

      {/* Card grid */}
      {hasFiles && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={pdfFiles.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {pdfFiles.map((pdf, index) => (
                <PdfCard
                  key={pdf.id}
                  pdf={pdf}
                  index={index}
                  onRemove={removeFile}
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
