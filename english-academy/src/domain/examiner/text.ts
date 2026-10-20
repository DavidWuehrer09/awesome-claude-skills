/**
 * Text helpers for the examiner's honesty checks: every quotation and every
 * criticised passage must actually exist where the report says it does.
 */
import { wordCount } from "@/lib/text";

const QUOTES: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"', "«": '"', "»": '"', "–": "-", "—": "-", " ": " ", "…": "...",
};

function translate(text: string) {
  return text.replace(/[‘’‚“”„«»–— …]/g, (c) => QUOTES[c] ?? c);
}

export function normalizeForMatch(text: string | null | undefined) {
  return translate(text ?? "")
    .toLowerCase()
    .replace(/-\s*\n\s*/g, "") // re-join words hyphenated across lines
    .replace(/\[\.\.\.\]|\(\.\.\.\)/g, " ... ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if `quote` occurs in `haystack`, ignoring case, whitespace and quote
 * styles. An ellipsis inside the quote ("a ... b") is honoured: each part must
 * occur, in order.
 */
export function containsQuote(haystack: string, quote: string) {
  const hay = normalizeForMatch(haystack);
  const parts = normalizeForMatch(quote)
    .split("...")
    .map((p) => p.replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, ""))
    .filter(Boolean);
  if (!parts.length) return false;
  let pos = 0;
  for (const part of parts) {
    const idx = hay.indexOf(part, pos);
    if (idx < 0) return false;
    pos = idx + part.length;
  }
  return true;
}

/** Direct quotations ("…") of at least `minWords` words inside a text. */
export function quotedSpans(text: string | null | undefined, minWords = 3) {
  const t = translate(text ?? "");
  return [...t.matchAll(/"([^"\n]{3,400})"/g)].map((m) => m[1]).filter((s) => wordCount(s) >= minWords);
}

/** Word-level similarity in [0, 1] (2·LCS / total words), like a sequence-matcher ratio. */
export function similarity(a: string, b: string) {
  const x = normalizeForMatch(a).match(/\w+/g) ?? [];
  const y = normalizeForMatch(b).match(/\w+/g) ?? [];
  if (!x.length || !y.length) return 0;
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return (2 * prev[y.length]) / (x.length + y.length);
}

export function sentences(text: string, minWords = 6) {
  return (text ?? "").split(/(?<=[.!?])\s+|\n+/).filter((s) => wordCount(s) >= minWords);
}

/** Set of overlapping n-word sequences, used to spot copied source passages. */
export function shingles(text: string, n = 8) {
  const words = normalizeForMatch(text).match(/\w+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Split a long text into segments at paragraph boundaries (for search snippets and AI context). */
export function segment(text: string, limit = 6000) {
  const segments: string[] = [];
  let buf: string[] = [];
  const size = () => buf.reduce((n, b) => n + b.length + 2, 0);
  const flush = () => {
    if (buf.length) segments.push(buf.join("\n\n"));
    buf = [];
  };
  for (let para of text.split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    while (para.length > limit) {
      flush();
      const cut = para.lastIndexOf(" ", limit);
      const at = cut > limit * 0.5 ? cut : limit;
      segments.push(para.slice(0, at));
      para = para.slice(at).trimStart();
    }
    if (size() + para.length > limit) flush();
    buf.push(para);
  }
  flush();
  return segments;
}
