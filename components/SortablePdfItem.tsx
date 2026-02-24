"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PdfFile } from "@/components/PdfMerger";

interface Props {
  pdf: PdfFile;
  index: number;
  onRemove: (id: string) => void;
}

export default function SortablePdfItem({ pdf, index, onRemove }: Props) {
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
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const sizeLabel = formatBytes(pdf.file.size);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50"
    >
      {/* Drag handle */}
      <button
        className="flex-shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
      </button>

      {/* Position badge */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
        {index + 1}
      </span>

      {/* PDF icon */}
      <svg
        className="flex-shrink-0 w-6 h-6 text-red-500"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9.5 15.5c-.3 0-.5-.2-.5-.5v-4c0-.3.2-.5.5-.5H11c.8 0 1.5.7 1.5 1.5S11.8 13.5 11 13.5h-1v1.5c0 .3-.2.5-.5.5zm1-3.5h1c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-1v1zm3.5 3.5c-.3 0-.5-.2-.5-.5v-4c0-.3.2-.5.5-.5h.75C15.5 10.5 16.5 11.7 16.5 13s-1 2.5-2.25 2.5H14zm.5-4v3c.7-.1 1.25-.8 1.25-1.5S15.2 11.6 14.5 11.5zm3.5 4c-.3 0-.5-.2-.5-.5v-4c0-.3.2-.5.5-.5h1.5c.3 0 .5.2.5.5s-.2.5-.5.5H19V13h1c.3 0 .5.2.5.5s-.2.5-.5.5h-1v1c0 .3-.2.5-.5.5z" />
      </svg>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{pdf.file.name}</p>
        <p className="text-xs text-gray-400">{sizeLabel}</p>
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(pdf.id)}
        className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
        aria-label="Remove file"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
