"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PdfFile } from "@/components/PdfMerger";

interface Props {
  pdf: PdfFile;
  index: number;
  isCover: boolean;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onSetCover: (id: string) => void;
}

export default function PdfCard({ pdf, index, isCover, onRemove, onRename, onSetCover }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pdf.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col rounded-xl border bg-white aspect-[3/4] overflow-hidden select-none transition-all ${
        isDragging
          ? "shadow-2xl border-blue-400 opacity-75 ring-2 ring-blue-300"
          : isCover
          ? "border-blue-400 shadow-md ring-2 ring-blue-300"
          : "border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md"
      }`}
    >
      {/* Position badge */}
      <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow">
        {index + 1}
      </div>

      {/* Cover badge */}
      {isCover && (
        <div className="absolute top-2 left-10 z-10 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wide shadow">
          Cover
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(pdf.id)}
        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-white border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        aria-label="Remove"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Drag area */}
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <PdfIcon />

        {/* Set-as-cover bookmark button — shown on hover (or always when cover) */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetCover(pdf.id); }}
          onPointerDown={(e) => e.stopPropagation()} // prevent drag from activating
          title={isCover ? "This PDF provides the cover page" : "Set as cover (FRP)"}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
            isCover
              ? "bg-blue-50 border-blue-300 text-blue-600"
              : "bg-white border-stone-200 text-stone-400 opacity-0 group-hover:opacity-100 hover:border-blue-300 hover:text-blue-500"
          }`}
        >
          <BookmarkIcon filled={isCover} />
          {isCover ? "Cover source" : "Set as cover"}
        </button>
      </div>

      {/* Footer */}
      <div className="px-2 pb-2 pt-1" onPointerDown={(e) => e.stopPropagation()}>
        {/* Editable section name */}
        <input
          type="text"
          value={pdf.sectionName}
          onChange={(e) => onRename(pdf.id, e.target.value)}
          placeholder="Section name…"
          className="w-full text-xs font-medium text-stone-800 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-blue-300 focus:outline-none leading-tight py-0.5 truncate"
          title={pdf.sectionName}
        />
        <p className="text-[11px] text-stone-400 mt-0.5">{formatBytes(pdf.file.size)}</p>
      </div>
    </div>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
    </svg>
  ) : (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="w-12 h-12 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M13 3v5a1 1 0 001 1h5" />
      <text x="12" y="17" textAnchor="middle" fontSize="4.5" fontWeight="700"
        fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">
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
