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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { mergePdfs } from "@/lib/mergePdfs";
import SortablePdfItem from "@/components/SortablePdfItem";

export interface PdfFile {
  id: string;
  file: File;
  pageCount?: number;
}

export default function PdfMerger() {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: PdfFile[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
      }));

    if (newFiles.length === 0) {
      setError("Please select valid PDF files.");
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

  const handleDragLeave = () => setIsDraggingOver(false);

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
      setError("Please add at least 2 PDFs to merge.");
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

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDraggingOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center gap-2 text-gray-500">
          <svg
            className="w-10 h-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"
            />
          </svg>
          <p className="text-sm font-medium">
            Drop PDFs here or{" "}
            <span className="text-blue-600 underline">browse</span>
          </p>
          <p className="text-xs text-gray-400">PDF files only</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {/* File list */}
      {pdfFiles.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {pdfFiles.length} file{pdfFiles.length !== 1 ? "s" : ""} — drag to reorder
            </span>
            <button
              onClick={() => setPdfFiles([])}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pdfFiles.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-gray-100">
                {pdfFiles.map((pdf, index) => (
                  <SortablePdfItem
                    key={pdf.id}
                    pdf={pdf}
                    index={index}
                    onRemove={removeFile}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Merge button */}
      <button
        onClick={handleMerge}
        disabled={pdfFiles.length < 2 || isMerging}
        className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isMerging ? "Merging…" : `Merge ${pdfFiles.length > 0 ? pdfFiles.length : ""} PDFs`}
      </button>
    </div>
  );
}
