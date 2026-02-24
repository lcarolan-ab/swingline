"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PdfFile } from "@/components/PdfMerger";

interface Props {
  pdf: PdfFile;
  index: number;
  onRemove: (id: string) => void;
}

export default function PdfCard({ pdf, index, onRemove }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pdf.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sizeLabel = formatBytes(pdf.file.size);
  // Strip extension for display
  const nameWithoutExt = pdf.file.name.replace(/\.pdf$/i, "");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col rounded-xl border bg-white aspect-[3/4] overflow-hidden select-none transition-all ${
        isDragging
          ? "shadow-2xl border-blue-400 opacity-75 ring-2 ring-blue-300"
          : "border-gray-200 shadow-sm hover:border-blue-200 hover:shadow-md hover:shadow-blue-100/60"
      }`}
    >
      {/* Position badge */}
      <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow">
        {index + 1}
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(pdf.id)}
        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        aria-label="Remove"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Drag area — covers the icon section */}
      <div
        className="flex-1 flex items-center justify-center cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <PdfIcon />
      </div>

      {/* File info footer */}
      <div className="px-3 pb-3 pt-1">
        <p
          className="text-xs font-medium text-gray-800 truncate leading-tight"
          title={pdf.file.name}
        >
          {nameWithoutExt}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">{sizeLabel}</p>
      </div>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg
      className="w-12 h-12 text-red-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
        d="M13 3v5a1 1 0 001 1h5"
      />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="4.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, sans-serif"
        className="text-red-500"
      >
        PDF
      </text>
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
