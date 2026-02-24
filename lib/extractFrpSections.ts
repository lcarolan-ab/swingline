import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface FrpPageInfo {
  /** Text from the top-right area of the page (section/report title). */
  reportTitle: string;
  /** Text from the top-left area — subheading if present, else primary name. */
  portfolioName: string;
}

/**
 * Extracts per-page header info from an FRP PDF for use in the TOC.
 *
 * Reads pages 2…N (page 1 is the book cover) and for each page collects
 * text items from the top 20 % of the page, splitting on the horizontal
 * midpoint:
 *   - right half → report / section title
 *   - left half  → portfolio / entity name (prefers the second visual line,
 *                  i.e. the subheading, when two or more lines are present)
 *
 * pdfjs-dist is imported dynamically so this module can be included in
 * "use client" components without triggering SSR prerender errors.
 */
export async function extractFrpPageInfo(file: File): Promise<FrpPageInfo[]> {
  // Dynamic import keeps pdfjs-dist out of the SSR bundle entirely.
  const pdfjsLib = await import("pdfjs-dist");

  // Serve the worker from public/ — no webpack/turbopack config needed.
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const results: FrpPageInfo[] = [];

  for (let pageNum = 2; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: 1 });

    // PDF y-coordinates increase upward from 0 at the bottom.
    // "Top 20%" means y > pageHeight * 0.80.
    const topThreshold = pageHeight * 0.8;
    const midX         = pageWidth  / 2;

    const textContent = await page.getTextContent();

    const leftItems:  Array<{ str: string; y: number }> = [];
    const rightItems: Array<{ str: string; y: number }> = [];

    for (const raw of textContent.items) {
      const item = raw as TextItem;
      if (!item.str?.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      if (y < topThreshold) continue;
      (x < midX ? leftItems : rightItems).push({ str: item.str.trim(), y });
    }

    // Right side: join all text top-to-bottom for the report title,
    // then strip any trailing date (e.g. "Portfolio Summary December 31, 2025").
    const reportTitle = stripTrailingDate(
      rightItems
        .sort((a, b) => b.y - a.y)
        .map((i) => i.str)
        .join(" ")
        .trim(),
    ) || "—";

    // Left side: group into visual lines (items within 3 pt share a line).
    const leftSorted = leftItems.sort((a, b) => b.y - a.y);
    const lines: string[][] = [];
    let currentLine: typeof leftSorted = [];
    for (const item of leftSorted) {
      if (currentLine.length === 0 || Math.abs(currentLine[0].y - item.y) <= 3) {
        currentLine.push(item);
      } else {
        lines.push(currentLine.map((i) => i.str));
        currentLine = [item];
      }
    }
    if (currentLine.length) lines.push(currentLine.map((i) => i.str));

    // Prefer the second line (subheading / specific entity) when present.
    const portfolioName = (lines[1] ?? lines[0] ?? []).join(" ").trim() || "—";

    results.push({ reportTitle, portfolioName });
  }

  return results;
}

/**
 * Removes a trailing month-day-year date from a string.
 * e.g. "Portfolio Summary December 31, 2025" → "Portfolio Summary"
 */
function stripTrailingDate(text: string): string {
  return text
    .replace(
      /\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}.*/i,
      "",
    )
    .trim();
}
