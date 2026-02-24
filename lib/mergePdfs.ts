import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { FrpPageInfo } from "@/lib/extractFrpSections";

export interface Section {
  file: File;
  name: string;
}

export interface BookMetadata {
  clientName: string;
  periodDate: string; // e.g. "December 31, 2025"
}

interface TocEntry {
  reportTitle: string;
  portfolioName: string;
  page: number;
}

// ─── colours (matched to the ArchBridge TOC example) ───────────────────────
const BLUE       = rgb(0.106, 0.431, 0.761);  // #1B6EC2 — titles / headers
const LIGHT_BLUE = rgb(0.357, 0.608, 0.835);  // #5B9BD5 — data rows
const BLACK      = rgb(0,     0,     0);

// ─── page dimensions (landscape letter, same as the source PDFs) ────────────
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 54;

// ─── column x-positions for the TOC table ───────────────────────────────────
const COL_SECTION   = MARGIN;
const COL_REPORT    = MARGIN + 90;
const COL_PORTFOLIO = MARGIN + 340;
const COL_PAGE_R    = PAGE_W - MARGIN; // right-edge for right-aligned page numbers

/**
 * Build the performance book.
 *
 * Structure of the output:
 *   Page 1   — cover page  (page 1 of the section at coverIndex)
 *   Page 2   — generated Table of Contents
 *   Pages 3… — all sections in display order; the cover section contributes
 *               only its pages 2… (page 1 was used as the cover above)
 *
 * When `frpPageInfo` is supplied the cover section's TOC row expands into one
 * row per content page, each showing the extracted report title and portfolio
 * name from that page's header.
 */
export async function buildPerformanceBook(
  sections: Section[],
  coverIndex: number,
  metadata: BookMetadata,
  frpPageInfo?: FrpPageInfo[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ── load all PDFs ──────────────────────────────────────────────────────────
  const pdfs = await Promise.all(
    sections.map(async (s) => PDFDocument.load(await s.file.arrayBuffer())),
  );

  // ── calculate TOC entries (sections in display order) ─────────────────────
  // Page 1 = cover, Page 2 = TOC, Page 3+ = section content in display order.
  // The cover section contributes (N-1) content pages; all others contribute N.
  const tocEntries: TocEntry[] = [];
  let curPage = 3;

  for (let i = 0; i < sections.length; i++) {
    if (i === coverIndex && frpPageInfo && frpPageInfo.length > 0) {
      // One TOC row per unique (reportTitle, portfolioName) run; the page
      // number points to the first page where that combination appears.
      // curPage still advances for every physical page regardless.
      let lastKey = "";
      for (const info of frpPageInfo) {
        const key = `${info.reportTitle}|${info.portfolioName}`;
        if (key !== lastKey) {
          tocEntries.push({
            reportTitle:   info.reportTitle,
            portfolioName: info.portfolioName,
            page:          curPage,
          });
          lastKey = key;
        }
        curPage++;
      }
    } else {
      const contentPages =
        i === coverIndex
          ? Math.max(0, pdfs[i].getPageCount() - 1) // page 1 extracted as cover
          : pdfs[i].getPageCount();
      tocEntries.push({
        reportTitle:   sections[i].name,
        portfolioName: metadata.clientName,
        page:          curPage,
      });
      curPage += contentPages;
    }
  }

  // ── assemble the document ─────────────────────────────────────────────────
  // 1. Cover page (page 1 of the designated cover PDF)
  const [coverPage] = await doc.copyPages(pdfs[coverIndex], [0]);
  doc.addPage(coverPage);

  // 2. TOC page
  await buildTocPage(doc, metadata, tocEntries, fontBold, fontRegular, fontOblique);

  // 3. Section content in display order
  for (let i = 0; i < sections.length; i++) {
    const pdf = pdfs[i];
    if (i === coverIndex) {
      // Skip page 1 — it's already the cover
      if (pdf.getPageCount() > 1) {
        const indices = Array.from({ length: pdf.getPageCount() - 1 }, (_, j) => j + 1);
        for (const p of await doc.copyPages(pdf, indices)) doc.addPage(p);
      }
    } else {
      for (const p of await doc.copyPages(pdf, pdf.getPageIndices())) doc.addPage(p);
    }
  }

  // 4. Stamp page numbers bottom-right, starting at page 3 (index 2).
  //    Cover (index 0) and TOC (index 1) intentionally receive no number.
  const totalPages = doc.getPageCount();
  const GRAY = rgb(0.55, 0.55, 0.55);
  for (let i = 2; i < totalPages; i++) {
    const pg      = doc.getPage(i);
    const { width } = pg.getSize();
    const numStr  = String(i + 1);          // page 3, 4, 5 …
    const numW    = fontRegular.widthOfTextAtSize(numStr, 9);
    pg.drawText(numStr, {
      x: width - MARGIN - numW,
      y: 18,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
  }

  return doc.save();
}

// ─── TOC page builder ─────────────────────────────────────────────────────────
async function buildTocPage(
  doc: PDFDocument,
  metadata: BookMetadata,
  entries: TocEntry[],
  fontBold: PDFFont,
  fontRegular: PDFFont,
  fontOblique: PDFFont,
): Promise<PDFPage> {
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // ── title ──────────────────────────────────────────────────────────────────
  page.drawText("Table of Contents", {
    x: MARGIN, y: PAGE_H - 70,
    size: 26, font: fontBold, color: BLUE,
  });

  // ── date ──────────────────────────────────────────────────────────────────
  page.drawText(metadata.periodDate, {
    x: MARGIN, y: PAGE_H - 98,
    size: 13, font: fontOblique, color: BLUE,
  });

  // ── table ─────────────────────────────────────────────────────────────────
  const tableTop = PAGE_H - 148;

  // thick rule above headers
  page.drawLine({
    start: { x: MARGIN, y: tableTop },
    end:   { x: PAGE_W - MARGIN, y: tableTop },
    thickness: 1.5, color: BLACK,
  });

  // column headers
  const headerY = tableTop - 18;
  page.drawText("Section",   { x: COL_SECTION,   y: headerY, size: 11, font: fontBold, color: BLUE });
  page.drawText("Report",    { x: COL_REPORT,     y: headerY, size: 11, font: fontBold, color: BLUE });
  page.drawText("Portfolio", { x: COL_PORTFOLIO,  y: headerY, size: 11, font: fontBold, color: BLUE });
  // right-align "Page" header
  const pageHeaderW = fontBold.widthOfTextAtSize("Page", 11);
  page.drawText("Page", { x: COL_PAGE_R - pageHeaderW, y: headerY, size: 11, font: fontBold, color: BLUE });

  // thin rule below headers
  page.drawLine({
    start: { x: MARGIN, y: tableTop - 28 },
    end:   { x: PAGE_W - MARGIN, y: tableTop - 28 },
    thickness: 0.5, color: LIGHT_BLUE,
  });

  // column max-widths (leave 8pt gutter before the next column)
  const MAX_REPORT_W    = COL_PORTFOLIO - COL_REPORT    - 8;
  const MAX_PORTFOLIO_W = COL_PAGE_R    - COL_PORTFOLIO - 40; // 40pt buffer before page number

  // data rows
  entries.forEach(({ reportTitle, portfolioName, page: startPage }, i) => {
    const rowY = tableTop - 40 - i * 14;
    const reportText    = truncateText(reportTitle,   fontRegular, 10, MAX_REPORT_W);
    const portfolioText = truncateText(portfolioName, fontRegular, 10, MAX_PORTFOLIO_W);

    page.drawText(String(i + 1), { x: COL_SECTION,   y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });
    page.drawText(reportText,    { x: COL_REPORT,     y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });
    page.drawText(portfolioText, { x: COL_PORTFOLIO,  y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });

    // right-align page number
    const numStr = String(startPage);
    const numW   = fontRegular.widthOfTextAtSize(numStr, 10);
    page.drawText(numStr, { x: COL_PAGE_R - numW, y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });
  });

  // ── logo placeholder (bottom-left) ────────────────────────────────────────
  drawWaveMark(page, MARGIN, 30, BLUE);
  page.drawText("ArchBridge Family Office", {
    x: MARGIN + 28, y: 32,
    size: 8, font: fontBold, color: BLUE,
  });

  return page;
}

/** Truncates text with an ellipsis so it fits within maxWidth pts at the given size. */
function truncateText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * Draws a simplified version of the ArchBridge wave mark using three bezier arcs.
 * Each arc bows upward; arcs are stacked and shrink toward the top.
 */
function drawWaveMark(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  const arcs: [number, number, number][] = [
    [0,   20, 6],  // bottom — widest
    [2,   16, 5],  // middle
    [4,   12, 4],  // top    — narrowest
  ];

  arcs.forEach(([ox, w, h], i) => {
    const sy = y + i * 6;
    const sx = x + ox;
    const path =
      `M ${sx} ${sy} ` +
      `C ${sx + w * 0.25} ${sy + h}, ${sx + w * 0.75} ${sy + h}, ${sx + w} ${sy}`;
    page.drawSvgPath(path, { x: 0, y: 0, borderColor: color, borderWidth: 1.5 });
  });
}
