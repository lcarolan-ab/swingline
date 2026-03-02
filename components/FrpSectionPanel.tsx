"use client";

import type { FrpSection } from "@/lib/extractFrpSections";

interface Props {
  sections: FrpSection[];
  isExtracting: boolean;
  onToggle: (id: string) => void;
}

export default function FrpSectionPanel({ sections, isExtracting, onToggle }: Props) {
  if (isExtracting) {
    return (
      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Reading FRP report sections…
        </div>
      </div>
    );
  }

  if (sections.length === 0) return null;

  const enabledCount = sections.filter((s) => s.enabled).length;

  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50/60">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-stone-700">FRP Report Sections</span>
        </div>
        <span className="text-xs text-stone-400">
          {enabledCount} of {sections.length} included
        </span>
      </div>

      {/* Section rows */}
      <ul className="divide-y divide-stone-100">
        {sections.map((section) => {
          const pageCount = section.endIdx - section.startIdx + 1;
          return (
            <li key={section.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50/60 transition-colors">
              <button
                onClick={() => onToggle(section.id)}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  section.enabled
                    ? "bg-blue-600 border-blue-600"
                    : "bg-white border-stone-300 hover:border-stone-400"
                }`}
                aria-label={section.enabled ? "Exclude section" : "Include section"}
              >
                {section.enabled && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              <div className={`flex-1 min-w-0 ${section.enabled ? "" : "opacity-40"}`}>
                <p className="text-sm font-medium text-stone-800 truncate">
                  {section.reportTitle}
                </p>
                <p className="text-xs text-stone-400 truncate">
                  {section.portfolioName}
                  <span className="ml-2 text-stone-300">
                    · {pageCount} {pageCount === 1 ? "page" : "pages"}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
