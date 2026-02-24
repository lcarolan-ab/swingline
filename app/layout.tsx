import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stapler – Merge PDFs",
  description: "Easily combine multiple PDFs into one. Upload, reorder, and merge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
