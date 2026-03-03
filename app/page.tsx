import PdfMerger from "@/components/PdfMerger";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#ededee]">
      {/* Header / wordmark */}
      <header className="text-center pt-12 pb-8 px-4">
        <div className="inline-flex items-center gap-2.5 mb-2">
          <img src="/ARCH_ID_2C.png" alt="ArchBridge logo" className="h-9 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Stapler
          </h1>
        </div>
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
