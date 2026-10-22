/** Normalise text for tolerant verbatim matching: typographic quotes/dashes, whitespace, case. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripWrappingQuotes(s: string) {
  return s.trim().replace(/^["']+|["']+$/g, "").trim();
}

/**
 * True if `quote` occurs in `haystack` (tolerant to typography/whitespace/case).
 * Ellipses ("..." or "…") are allowed: each fragment must occur, in order.
 */
export function containsQuote(haystack: string, quote: string): boolean {
  const h = normalizeForMatch(haystack);
  const q = normalizeForMatch(stripWrappingQuotes(quote)).replace(/…/g, "...");
  if (!q) return false;
  const fragments = q.split(/\s*(?:\.\.\.|\[\.\.\.\])\s*/).map((f) => f.trim()).filter((f) => f.length > 0);
  if (fragments.length === 0) return false;
  let from = 0;
  for (const f of fragments) {
    const idx = h.indexOf(f, from);
    if (idx === -1) return false;
    from = idx + f.length;
  }
  return true;
}

export function wordCount(s: string): number {
  const m = s.trim().match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*/g);
  return m ? m.length : 0;
}

/** Strings inside double quotation marks (straight or curly), e.g. quoted evidence. */
export function extractQuotedStrings(s: string): string[] {
  const out: string[] = [];
  const re = /["“„]([^"“”„]{3,}?)["”“]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

export function normalizeLabel(s: string): string {
  return normalizeForMatch(s).replace(/[^\p{L}\p{N}+' -]/gu, "").replace(/\s+/g, " ").trim();
}
