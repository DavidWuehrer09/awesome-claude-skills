/**
 * Fit long documents into an AI request without silently losing what matters.
 * Documents that fit are sent whole. Longer ones are split at paragraph
 * boundaries; the opening (title, instructions) and every segment that looks
 * grading-relevant are kept first, then the rest in order while the budget
 * lasts. Omitted parts are marked in the text and reported as notes so the
 * learner sees what the AI did not read.
 */
import { segment } from "./text";

export type PackDoc = { id: string; filename: string; text: string };

const GRADING = /\b(points?|punkte|BE\b|bewertung|rubric|criteria|kriterien|erwartung|expect|grading|notenschl|gewichtung|words?\b|minutes?|minuten|arbeitszeit|task\s*\d|aufgabe|operator|summari[sz]e|analy[sz]e|comment|discuss|mediat|assess)/i;

export function packDocuments(docs: PackDoc[], budgetChars: number, segmentChars = 3000) {
  const notes: string[] = [];
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  if (total <= budgetChars) return { docs: docs.map((d) => ({ ...d, promptText: d.text })), notes };

  // Short documents keep their full text; the remaining budget is shared by the long ones.
  const fair = budgetChars / Math.max(1, docs.length);
  const short = docs.filter((d) => d.text.length <= fair);
  let remaining = budgetChars - short.reduce((n, d) => n + d.text.length, 0);
  const long = docs.filter((d) => d.text.length > fair).sort((a, b) => a.text.length - b.text.length);
  const packed = new Map<string, string>(short.map((d) => [d.id, d.text]));

  long.forEach((d, i) => {
    const share = remaining / (long.length - i);
    const segs = segment(d.text, segmentChars);
    const keep = new Set<number>([0]);
    let used = segs[0]?.length ?? 0;
    const order = [...segs.keys()].slice(1).sort((a, b) => Number(GRADING.test(segs[b])) - Number(GRADING.test(segs[a])) || a - b);
    for (const k of order) {
      if (used + segs[k].length > share) continue;
      keep.add(k);
      used += segs[k].length;
    }
    const parts: string[] = [];
    let gap = 0;
    segs.forEach((s, k) => {
      if (keep.has(k)) {
        if (gap) parts.push(`[… ${gap} section${gap === 1 ? "" : "s"} omitted for length …]`);
        gap = 0;
        parts.push(s);
      } else gap++;
    });
    if (gap) parts.push(`[… ${gap} section${gap === 1 ? "" : "s"} omitted for length …]`);
    packed.set(d.id, parts.join("\n\n"));
    remaining -= used;
    if (keep.size < segs.length) {
      notes.push(`“${d.filename}” is long: the AI read ${keep.size} of ${segs.length} sections (the opening and grading-related parts first).`);
    }
  });
  return { docs: docs.map((d) => ({ ...d, promptText: packed.get(d.id) ?? d.text })), notes };
}
