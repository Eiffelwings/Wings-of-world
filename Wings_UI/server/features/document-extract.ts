// Document text extraction.
//
// Reads a binary file (PDF or plain text variants) and returns clean text
// for the agent to consume. PDF support uses `pdfjs-dist` lazily so the
// rest of the server boots even when the dep can't load on a given
// platform. Inspired by OpenClaw's `document-extract` extension (MIT —
// see NOTICE) but reimplemented to drop the canvas dependency we don't
// need for text-only extraction.

import fs from "fs";
import path from "path";

export type DocumentKind = "pdf" | "text" | "markdown" | "json" | "csv" | "unknown";

export interface DocumentExtractionResult {
  path: string;
  kind: DocumentKind;
  pages?: number;
  text: string;
  textLength: number;
  truncated: boolean;
  metadata?: Record<string, unknown>;
}

export interface DocumentExtractionOptions {
  /** Cap returned text. Default 200_000 chars — enough for most papers. */
  maxChars?: number;
  /** Optional page range "1-5" for PDFs; default = all pages up to maxPages. */
  pageRange?: string;
  /** Hard cap on PDF pages we'll attempt to render. Default 100. */
  maxPages?: number;
}

const DEFAULT_MAX_CHARS = 200_000;
const DEFAULT_MAX_PAGES = 100;

function classifyKind(filePath: string): DocumentKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".json") return "json";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  if (ext === ".txt" || ext === ".log" || ext === "") return "text";
  return "unknown";
}

function parsePageRange(range: string | undefined, totalPages: number, maxPages: number): number[] {
  const cap = Math.min(totalPages, maxPages);
  if (!range) return Array.from({ length: cap }, (_, i) => i + 1);
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(range.trim());
  if (m) {
    const start = Math.max(1, Number(m[1]));
    const end = Math.min(totalPages, Number(m[2]));
    const list: number[] = [];
    for (let p = start; p <= end && list.length < maxPages; p++) list.push(p);
    return list;
  }
  // Single page or comma list "1,3,5".
  return range
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= totalPages)
    .slice(0, maxPages);
}

let pdfJsModulePromise: Promise<any> | null = null;
async function loadPdfJs(): Promise<any> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
      pdfJsModulePromise = null;
      throw new Error(
        `PDF support unavailable: failed to load pdfjs-dist (${err?.message || err})`,
      );
    });
  }
  return pdfJsModulePromise;
}

async function extractPdf(
  filePath: string,
  options: DocumentExtractionOptions,
): Promise<DocumentExtractionResult> {
  const data = fs.readFileSync(filePath);
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true });
  const pdfDoc = await loadingTask.promise;
  const totalPages: number = pdfDoc.numPages;
  const pageNumbers = parsePageRange(options.pageRange, totalPages, options.maxPages ?? DEFAULT_MAX_PAGES);
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  for (const pageNo of pageNumbers) {
    const page = await pdfDoc.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item: { str?: string }) => (typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
    const block = pageText ? `[page ${pageNo}]\n${pageText}\n` : "";
    if (used + block.length > maxChars) {
      parts.push(block.slice(0, maxChars - used));
      used = maxChars;
      truncated = true;
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return {
    path: filePath,
    kind: "pdf",
    pages: totalPages,
    text: parts.join("\n").trim(),
    textLength: used,
    truncated,
    metadata: { extractedPages: pageNumbers.length, totalPages },
  };
}

function extractTextFile(
  filePath: string,
  kind: DocumentKind,
  options: DocumentExtractionOptions,
): DocumentExtractionResult {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  let text = fs.readFileSync(filePath, "utf-8");
  const original = text.length;
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  return {
    path: filePath,
    kind,
    text,
    textLength: text.length,
    truncated,
    metadata: { originalChars: original },
  };
}

export async function extractDocument(
  filePath: string,
  options: DocumentExtractionOptions = {},
): Promise<DocumentExtractionResult> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  const kind = classifyKind(resolved);
  switch (kind) {
    case "pdf":
      return extractPdf(resolved, options);
    case "text":
    case "markdown":
    case "json":
    case "csv":
      return extractTextFile(resolved, kind, options);
    case "unknown":
      // Try as text — many "unknown" extensions are still UTF-8 documents.
      try {
        return extractTextFile(resolved, "text", options);
      } catch (err: any) {
        throw new Error(`Cannot extract text from ${resolved}: ${err?.message || err}`);
      }
  }
}
