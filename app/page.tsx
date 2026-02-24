import PdfMerger from "@/components/PdfMerger";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Stapler</h1>
          <p className="text-gray-500 text-lg">
            Combine multiple PDFs into one. Upload, reorder, and merge.
          </p>
        </div>
        <PdfMerger />
      </div>
    </main>
  );
}
