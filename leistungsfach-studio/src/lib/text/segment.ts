export type Sentence = { id: string; paragraph: number; index: number; text: string };

const ABBREVIATIONS = new Set([
  "e.g", "i.e", "etc", "mr", "mrs", "ms", "dr", "prof", "st", "vs", "cf", "l", "ll", "p", "pp", "no", "vol", "ch", "approx", "jr", "sr", "fig", "ed", "eds", "u.s", "u.k", "a.m", "p.m",
]);

/** Splits a paragraph into sentences without breaking at common abbreviations or line references ("l. 12"). */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out: string[] = [];
  const boundary = /([.!?…]+)(["'”’)\]]*)(\s+)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text))) {
    const endOfPunct = m.index + m[1].length + m[2].length;
    const before = text.slice(start, m.index);
    const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] ?? "").toLowerCase();
    const next = text.slice(m.index + m[0].length);
    const nextChar = next.charAt(0);
    const isAbbrev = m[1] === "." && ABBREVIATIONS.has(lastWord.replace(/\.$/, ""));
    const isInitial = m[1] === "." && /^[A-Z]$/.test(before.match(/([A-Za-z]+)$/)?.[1] ?? "") && /[A-Z]/.test(nextChar);
    const startsNew = /["'“‘(\[A-Z0-9]/.test(nextChar);
    if (isAbbrev || isInitial || !startsNew) continue;
    out.push(text.slice(start, endOfPunct).trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Paragraphs are separated by line breaks; each non-empty line block is one paragraph. */
export function segmentEssay(text: string): Sentence[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: Sentence[] = [];
  paragraphs.forEach((p, pi) => {
    splitSentences(p).forEach((s, si) => out.push({ id: `p${pi + 1}s${si + 1}`, paragraph: pi + 1, index: si + 1, text: s }));
  });
  return out;
}

export function sentencesToText(sentences: { paragraph: number; text: string }[]): string {
  const paras = new Map<number, string[]>();
  for (const s of sentences) {
    if (!paras.has(s.paragraph)) paras.set(s.paragraph, []);
    if (s.text) paras.get(s.paragraph)!.push(s.text);
  }
  return [...paras.values()].map((p) => p.join(" ")).filter(Boolean).join("\n\n");
}

export function renderNumberedSentences(sentences: Sentence[]): string {
  let current = 0;
  const lines: string[] = [];
  for (const s of sentences) {
    if (s.paragraph !== current) {
      current = s.paragraph;
      lines.push(`\n[Paragraph ${current}]`);
    }
    lines.push(`[${s.id}] ${s.text}`);
  }
  return lines.join("\n").trim();
}
