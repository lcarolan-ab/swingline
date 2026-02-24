import PdfMerger from "@/components/PdfMerger";

export default function Home() {
  return (
    <div className="min-h-screen bg-blue-950">
      {/* Header / wordmark */}
      <header className="text-center pt-12 pb-10 px-4">
        <div className="inline-flex items-center gap-3 mb-3">
          {/* Icon mark — swap this node for the real logo later */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/60">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              viewBox="0 0 20 20"
            >
              {/* Staple / arch shape */}
              <path d="M4 15V9a6 6 0 1 1 12 0v6" />
              <line x1="4" y1="15" x2="16" y2="15" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Stapler
          </h1>
        </div>
        <p className="text-blue-300/80 text-sm">
          Combine multiple PDFs into one — upload, reorder, merge.
        </p>
      </header>

      {/* Content panel */}
      <main className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl shadow-2xl shadow-blue-950/60 p-6">
          <PdfMerger />
        </div>
      </main>
    </div>
  );
}
