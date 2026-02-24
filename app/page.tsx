import PdfMerger from "@/components/PdfMerger";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f9f8f5]">
      {/* Header / wordmark */}
      <header className="text-center pt-12 pb-8 px-4">
        <div className="inline-flex items-center gap-2.5 mb-2">
          {/* Icon mark — swap this node for the real logo later */}
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <svg
              className="w-4.5 h-4.5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              viewBox="0 0 20 20"
            >
              <path d="M4 15V9a6 6 0 1 1 12 0v6" />
              <line x1="4" y1="15" x2="16" y2="15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Stapler
          </h1>
        </div>
        <p className="text-stone-400 text-sm">
          Combine multiple PDFs into one — upload, reorder, merge.
        </p>
      </header>

      {/* Content panel */}
      <main className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <PdfMerger />
        </div>
      </main>
    </div>
  );
}
