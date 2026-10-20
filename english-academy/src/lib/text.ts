/** Text helpers shared by import, answer checking and writing analysis. */

const TYPOGRAPHIC: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-", " ": " ", "…": "...",
};

export function normalizeTypography(s: string): string {
  return s.replace(/[‘’‚‛“”„–—− …]/g, (c) => TYPOGRAPHIC[c] ?? c);
}

/** Key used for duplicate detection: lower case, no leading "to ", collapsed space, no outer punctuation. */
export function normalizeHeadword(s: string): string {
  return normalizeTypography(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, "")
    .replace(/^to /, "");
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // Optimal string alignment distance (Levenshtein + adjacent transpositions).
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

export function wordCount(text: string): number {
  return (text.match(/[A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*/g) ?? []).length;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex matching a vocabulary item in running text, tolerating inflection of
 * each content word (undermine → undermines/undermined/undermining) and
 * dropping a leading infinitive "to" and placeholder words (sth, sb, one's).
 */
export function inflectionPattern(headword: string): RegExp | null {
  const words = normalizeHeadword(headword)
    .split(" ")
    .filter((w) => w && !["sth", "sb", "something", "somebody", "someone", "one's", "sth.", "sb."].includes(w));
  if (!words.length) return null;
  const parts = words.map((w) => {
    if (w.length <= 3) return escapeRegExp(w);
    const stem = w.replace(/(e|y)$/, "");
    return `${escapeRegExp(stem)}[a-z]{0,4}`;
  });
  return new RegExp(`\\b${parts.join("\\s+(?:\\w+\\s+)?")}\\b`, "i");
}
