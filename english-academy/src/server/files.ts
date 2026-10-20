import "server-only";
import { strFromU8, unzipSync } from "fflate";
import { HttpError } from "./http";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type FileKind = "text" | "csv" | "docx" | "pdf" | "xlsx" | "image";
export type Extracted =
  | { kind: "text"; text: string; notes: string[] }
  | { kind: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string; notes: string[] }
  | { kind: "scanned_pdf"; base64: string; notes: string[] };

/** Identify by content, not by the (user-controlled) name or MIME type. */
export function sniff(bytes: Uint8Array, filename: string): FileKind {
  const b = bytes;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image"; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image"; // JPEG
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image"; // WEBP
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image"; // GIF
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    if (ext === "xlsx") return "xlsx";
    if (ext === "docx") return "docx";
    throw new HttpError(415, "This ZIP-based file is not a .docx or .xlsx document", "unsupported_type");
  }
  // Plain text: reject binary content (NUL bytes) whatever the extension.
  const sample = b.subarray(0, 4096);
  if (sample.includes(0)) throw new HttpError(415, "Unsupported file type. Use TXT, CSV, DOCX, PDF, XLSX or an image.", "unsupported_type");
  return ext === "csv" || ext === "tsv" ? "csv" : "text";
}

function imageMediaType(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  if (b[0] === 0x89) return "image/png";
  if (b[0] === 0xff) return "image/jpeg";
  if (b[0] === 0x47) return "image/gif";
  return "image/webp";
}

export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return new TextDecoder("windows-1252").decode(bytes); // typical for lists exported on German Windows PCs
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

/** DOCX → text with headings, numbered/bulleted lists and tables (tab-separated) preserved. */
export function docxToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  } catch {
    throw new HttpError(422, "The Word file could not be opened (damaged or password-protected?)", "unreadable");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new HttpError(422, "Not a Word document", "unreadable");
  const doc = strFromU8(xml);
  const out: string[] = [];
  const paragraph = (p: string) => {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const numbered = /<w:numPr>/.test(p);
    const text = decodeXml(
      p
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .replace(/<w:delText[^>]*>[\s\S]*?<\/w:delText>/g, "")
        .replace(/<[^>]+>/g, ""),
    );
    if (!text.trim()) return "";
    if (/heading|berschrift|title/i.test(style)) return `# ${text.trim()}`;
    return numbered ? `- ${text.trim()}` : text;
  };
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(doc)?.[1] ?? doc;
  const blocks = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  for (const block of blocks) {
    if (block.startsWith("<w:tbl>")) {
      for (const row of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) =>
          (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map(paragraph).filter(Boolean).join(" ").replace(/\t/g, " "),
        );
        if (cells.some(Boolean)) out.push(cells.join("\t"));
      }
    } else {
      const t = paragraph(block);
      if (t) out.push(t);
    }
  }
  return out.join("\n");
}

export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    return { text: text.join("\n\n"), pages: totalPages };
  } catch {
    throw new HttpError(422, "The PDF could not be read (damaged or encrypted?)", "unreadable");
  }
}

export async function xlsxToText(bytes: Uint8Array): Promise<string> {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  try {
    const sheets = await readXlsxFile(Buffer.from(bytes));
    return sheets
      .map((s) => [sheets.length > 1 ? `# ${s.sheet}` : "", ...s.data.map((row) => row.map((c) => (c == null ? "" : String(c))).join("\t"))].filter(Boolean).join("\n"))
      .join("\n\n");
  } catch {
    throw new HttpError(422, "The spreadsheet could not be read", "unreadable");
  }
}

export async function extractFile(bytes: Uint8Array, filename: string): Promise<Extracted> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, "File too large (max 10 MB)", "too_large");
  if (!bytes.byteLength) throw new HttpError(400, "The file is empty", "empty");
  const kind = sniff(bytes, filename);
  switch (kind) {
    case "text":
    case "csv":
      return { kind: "text", text: decodeText(bytes), notes: [] };
    case "docx":
      return { kind: "text", text: docxToText(bytes), notes: ["Extracted from Word; tables become tab-separated columns"] };
    case "xlsx":
      return { kind: "text", text: await xlsxToText(bytes), notes: ["Extracted from the spreadsheet"] };
    case "pdf": {
      const { text, pages } = await pdfToText(bytes);
      if (text.replace(/\s/g, "").length < Math.max(30, pages * 20)) {
        return { kind: "scanned_pdf", base64: Buffer.from(bytes).toString("base64"), notes: ["The PDF has little or no text layer (probably scanned)"] };
      }
      return { kind: "text", text, notes: [`Extracted text from ${pages} PDF page(s)`] };
    }
    case "image":
      return { kind: "image", mediaType: imageMediaType(bytes), base64: Buffer.from(bytes).toString("base64"), notes: [] };
  }
}
