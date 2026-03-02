import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { AGGREGATE_REPORTS } from "@/lib/extractFrpSections";
import type { FrpPageInfo } from "@/lib/extractFrpSections";

export interface Section {
  file: File;
  name: string;
}

export interface BookMetadata {
  clientName: string;
  periodDate: string; // e.g. "December 31, 2025"
}

/** Per-section FRP extraction data passed to the book builder. */
export interface SectionFrpData {
  /** Full page-info array (index 0 = PDF page 1). */
  pageInfo: FrpPageInfo[];
  /** Indices into `pageInfo` for pages the user wants included. */
  includedPages: Set<number>;
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

// ─── TOC pagination constants ───────────────────────────────────────────────
const ROW_HEIGHT = 14;
const BOTTOM_CUTOFF = 54;   // keep clear of logo area

// First TOC page has title + date above the table, so the table starts lower.
const FIRST_TABLE_TOP    = PAGE_H - 148;
const FIRST_FIRST_ROW_Y  = FIRST_TABLE_TOP - 40;
const ROWS_FIRST_PAGE    = Math.floor((FIRST_FIRST_ROW_Y - BOTTOM_CUTOFF) / ROW_HEIGHT);

// Continuation pages omit the title/date so the table starts higher.
const CONT_TABLE_TOP     = PAGE_H - 70;
const CONT_FIRST_ROW_Y   = CONT_TABLE_TOP - 40;
const ROWS_CONT_PAGE     = Math.floor((CONT_FIRST_ROW_Y - BOTTOM_CUTOFF) / ROW_HEIGHT);

/** How many landscape pages are needed for `n` TOC rows? */
function tocPageCount(n: number): number {
  if (n <= ROWS_FIRST_PAGE) return 1;
  return 1 + Math.ceil((n - ROWS_FIRST_PAGE) / ROWS_CONT_PAGE);
}

/**
 * Build the performance book.
 *
 * Structure of the output:
 *   Page 1        — cover page  (page 1 of the section at coverIndex)
 *   Pages 2…T     — generated Table of Contents (T pages, paginated)
 *   Pages T+1…    — all sections in display order; the cover section contributes
 *                    only its pages 2… (page 1 was used as the cover above)
 *
 * `frpData` is an optional map keyed by section index.  For each section that
 * has FRP extraction data the TOC expands into one row per unique
 * (reportTitle, portfolioName) run, and only the pages in `includedPages` are
 * copied into the output.
 */
export async function buildPerformanceBook(
  sections: Section[],
  coverIndex: number,
  metadata: BookMetadata,
  frpData?: Map<number, SectionFrpData>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ── load all PDFs ──────────────────────────────────────────────────────────
  const pdfs = await Promise.all(
    sections.map(async (s) => PDFDocument.load(await s.file.arrayBuffer())),
  );

  // ── calculate TOC entries (preliminary — page numbers assume 1 TOC page) ──
  const tocEntries: TocEntry[] = [];
  let curPage = 3; // cover = 1, TOC = 2, content starts at 3

  for (let i = 0; i < sections.length; i++) {
    const data = frpData?.get(i);
    if (data && data.pageInfo.length > 0) {
      // FRP section — one TOC row per unique (reportTitle, portfolioName) run.
      // For the cover PDF, skip index 0 (that page is the book cover).
      const startIdx = i === coverIndex ? 1 : 0;
      let lastKey = "";
      for (let pi = startIdx; pi < data.pageInfo.length; pi++) {
        if (!data.includedPages.has(pi)) continue;
        const info = data.pageInfo[pi];
        const key = AGGREGATE_REPORTS.has(info.reportTitle)
          ? info.reportTitle
          : `${info.reportTitle}|${info.portfolioName}`;
        if (key !== lastKey) {
          const portfolioName = AGGREGATE_REPORTS.has(info.reportTitle)
            ? sections[i].name
            : info.portfolioName;
          tocEntries.push({
            reportTitle:   info.reportTitle,
            portfolioName,
            page:          curPage,
          });
          lastKey = key;
        }
        curPage++;
      }
    } else {
      // Plain section — one TOC row.
      const contentPages =
        i === coverIndex
          ? Math.max(0, pdfs[i].getPageCount() - 1)
          : pdfs[i].getPageCount();
      tocEntries.push({
        reportTitle:   sections[i].name,
        portfolioName: metadata.clientName,
        page:          curPage,
      });
      curPage += contentPages;
    }
  }

  // ── adjust page numbers if the TOC spills onto multiple pages ─────────────
  const numTocPages = tocPageCount(tocEntries.length);
  const pageShift   = numTocPages - 1; // extra pages beyond the assumed 1
  if (pageShift > 0) {
    for (const entry of tocEntries) entry.page += pageShift;
  }

  // ── assemble the document ─────────────────────────────────────────────────
  // 1. Cover page (page 1 of the designated cover PDF)
  const [coverPage] = await doc.copyPages(pdfs[coverIndex], [0]);
  doc.addPage(coverPage);

  // 2. TOC pages
  buildTocPages(doc, metadata, tocEntries, fontBold, fontRegular, fontOblique);

  // 3. Section content in display order
  for (let i = 0; i < sections.length; i++) {
    const pdf  = pdfs[i];
    const data = frpData?.get(i);

    if (i === coverIndex) {
      // Cover section: page 0 is the cover (already added above).
      if (pdf.getPageCount() > 1) {
        if (data) {
          // Copy only included pages, skipping page 0.
          const indices: number[] = [];
          for (let pi = 1; pi < data.pageInfo.length; pi++) {
            if (data.includedPages.has(pi)) indices.push(pi);
          }
          if (indices.length > 0) {
            for (const p of await doc.copyPages(pdf, indices)) doc.addPage(p);
          }
        } else {
          // No FRP data — copy all pages except page 0.
          const indices = Array.from({ length: pdf.getPageCount() - 1 }, (_, j) => j + 1);
          for (const p of await doc.copyPages(pdf, indices)) doc.addPage(p);
        }
      }
    } else if (data) {
      // Non-cover FRP section: copy only included pages.
      const indices: number[] = [];
      for (let pi = 0; pi < data.pageInfo.length; pi++) {
        if (data.includedPages.has(pi)) indices.push(pi);
      }
      if (indices.length > 0) {
        for (const p of await doc.copyPages(pdf, indices)) doc.addPage(p);
      }
    } else {
      // Plain section: copy all pages.
      for (const p of await doc.copyPages(pdf, pdf.getPageIndices())) doc.addPage(p);
    }
  }

  // 4. Stamp page numbers bottom-right on content pages.
  //    Cover (index 0) and TOC pages (indices 1…numTocPages) get no number.
  const firstContentIdx = 1 + numTocPages;
  const totalPages = doc.getPageCount();
  const GRAY = rgb(0.55, 0.55, 0.55);
  for (let i = firstContentIdx; i < totalPages; i++) {
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

// ─── TOC page builder (paginated) ────────────────────────────────────────────

function buildTocPages(
  doc: PDFDocument,
  metadata: BookMetadata,
  entries: TocEntry[],
  fontBold: PDFFont,
  fontRegular: PDFFont,
  fontOblique: PDFFont,
): void {
  const MAX_REPORT_W    = COL_PORTFOLIO - COL_REPORT    - 8;
  const MAX_PORTFOLIO_W = COL_PAGE_R    - COL_PORTFOLIO - 40;

  let entryIdx = 0;
  let pageNum  = 0;

  while (entryIdx < entries.length) {
    const isFirst  = pageNum === 0;
    const tableTop = isFirst ? FIRST_TABLE_TOP : CONT_TABLE_TOP;
    const maxRows  = isFirst ? ROWS_FIRST_PAGE : ROWS_CONT_PAGE;
    const page     = doc.addPage([PAGE_W, PAGE_H]);

    // ── title & date (first page only) ────────────────────────────────────
    if (isFirst) {
      page.drawText("Table of Contents", {
        x: MARGIN, y: PAGE_H - 70,
        size: 26, font: fontBold, color: BLUE,
      });
      page.drawText(metadata.periodDate, {
        x: MARGIN, y: PAGE_H - 98,
        size: 13, font: fontOblique, color: BLUE,
      });
    }

    // ── table header ──────────────────────────────────────────────────────
    page.drawLine({
      start: { x: MARGIN, y: tableTop },
      end:   { x: PAGE_W - MARGIN, y: tableTop },
      thickness: 1.5, color: BLACK,
    });

    const headerY = tableTop - 18;
    page.drawText("Section",   { x: COL_SECTION,   y: headerY, size: 11, font: fontBold, color: BLUE });
    page.drawText("Report",    { x: COL_REPORT,     y: headerY, size: 11, font: fontBold, color: BLUE });
    page.drawText("Portfolio", { x: COL_PORTFOLIO,  y: headerY, size: 11, font: fontBold, color: BLUE });
    const pageHeaderW = fontBold.widthOfTextAtSize("Page", 11);
    page.drawText("Page", { x: COL_PAGE_R - pageHeaderW, y: headerY, size: 11, font: fontBold, color: BLUE });

    page.drawLine({
      start: { x: MARGIN, y: tableTop - 28 },
      end:   { x: PAGE_W - MARGIN, y: tableTop - 28 },
      thickness: 0.5, color: LIGHT_BLUE,
    });

    // ── data rows ─────────────────────────────────────────────────────────
    const rowsThisPage = Math.min(maxRows, entries.length - entryIdx);
    for (let r = 0; r < rowsThisPage; r++) {
      const { reportTitle, portfolioName, page: startPage } = entries[entryIdx];
      const rowY = tableTop - 40 - r * ROW_HEIGHT;

      const reportText    = truncateText(reportTitle,   fontRegular, 10, MAX_REPORT_W);
      const portfolioText = truncateText(portfolioName, fontRegular, 10, MAX_PORTFOLIO_W);

      page.drawText(String(entryIdx + 1), { x: COL_SECTION,   y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });
      page.drawText(reportText,           { x: COL_REPORT,     y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });
      page.drawText(portfolioText,        { x: COL_PORTFOLIO,  y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });

      const numStr = String(startPage);
      const numW   = fontRegular.widthOfTextAtSize(numStr, 10);
      page.drawText(numStr, { x: COL_PAGE_R - numW, y: rowY, size: 10, font: fontRegular, color: LIGHT_BLUE });

      entryIdx++;
    }

    // ── logo (every TOC page) ─────────────────────────────────────────────
    drawWaveMark(page, MARGIN, 30, BLUE);
    page.drawText("ArchBridge Family Office", {
      x: MARGIN + 28, y: 32,
      size: 8, font: fontBold, color: BLUE,
    });

    pageNum++;
  }

  // Handle edge case: no entries at all — still need one blank TOC page
  if (entries.length === 0) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawText("Table of Contents", {
      x: MARGIN, y: PAGE_H - 70,
      size: 26, font: fontBold, color: BLUE,
    });
    page.drawText(metadata.periodDate, {
      x: MARGIN, y: PAGE_H - 98,
      size: 13, font: fontOblique, color: BLUE,
    });
    drawWaveMark(page, MARGIN, 30, BLUE);
    page.drawText("ArchBridge Family Office", {
      x: MARGIN + 28, y: 32,
      size: 8, font: fontBold, color: BLUE,
    });
  }
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
