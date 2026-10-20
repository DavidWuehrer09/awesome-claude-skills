/**
 * Deterministic vocabulary-list parser. Turns pasted or extracted text into
 * editable import candidates. It never drops a line silently: anything it is
 * unsure about is kept and flagged in `uncertain` for the review screen.
 */
import { collapseSpaces, normalizeTypography } from "@/lib/text";

export type ParsedCandidate = {
  headword: string;
  translationDe?: string;
  definitionEn?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
  partOfSpeech?: string;
  heading?: string;
  uncertain: string[];
  raw: string;
};

export type ParseResult = {
  format: "table" | "separated" | "mixed" | "empty";
  candidates: ParsedCandidate[];
  headings: string[];
  notes: string[];
};

const GERMAN_HINTS =
  /[äöüßÄÖÜ]|\b(der|die|das|den|dem|des|ein|eine|einen|einem|und|oder|nicht|sich|etw\.?|jdn\.?|jdm\.?|jds\.?|etwas|jemanden|jemandem|zu|mit|von|für|auf|über|untergraben|verschärfen)\b/i;
const ENGLISH_HINTS =
  /\b(the|a|an|of|to|in|on|with|for|something|someone|sth|sb|which|that|is|are|be|make|way|or|and|not|by|from|very)\b/i;

const POS_MAP: Record<string, string> = {
  v: "verb", vb: "verb", verb: "verb", vt: "verb", vi: "verb",
  n: "noun", noun: "noun", nn: "noun",
  adj: "adjective", adjective: "adjective", a: "adjective",
  adv: "adverb", adverb: "adverb",
  prep: "preposition", phr: "phrase", phrase: "phrase", idiom: "idiom",
  "phr v": "phrasal verb", "phr. v": "phrasal verb", "phrasal verb": "phrasal verb",
  conj: "conjunction", expr: "expression",
};

/** -1 = clearly English, +1 = clearly German, 0 = unclear. */
export function languageOf(text: string): -1 | 0 | 1 {
  const de = (text.match(new RegExp(GERMAN_HINTS.source, "gi")) ?? []).length;
  const en = (text.match(new RegExp(ENGLISH_HINTS.source, "gi")) ?? []).length;
  const capsNouns = (text.match(/(?:^|\s)[A-ZÄÖÜ][a-zäöüß]{3,}/g) ?? []).length;
  const deScore = de * 2 + (capsNouns >= 2 ? 1 : 0);
  if (deScore > en) return 1;
  if (en > deScore) return -1;
  if (text.trim().split(/\s+/).length === 1) {
    // single word: German nouns are capitalised, umlauts are a strong hint
    if (/[äöüß]/i.test(text) || /^[A-ZÄÖÜ][a-zäöüß]+$/.test(text.trim())) return 1;
  }
  return 0;
}

export function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (c === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function extractPos(head: string): { head: string; pos?: string } {
  const m = /\s*[([]?\b(phr\.? ?v|phrasal verb|adj|adv|prep|conj|expr|idiom|phrase|vt|vi|vb|v|n|noun|verb|adjective|adverb)\.?[)\]]?\s*$/i.exec(head);
  if (m && head.length > m[0].length) {
    const key = m[1].toLowerCase().replace(/\.$/, "");
    const pos = POS_MAP[key];
    if (pos) return { head: head.slice(0, m.index).trim(), pos };
  }
  if (/^to [a-z]/i.test(head)) return { head, pos: "verb" };
  return { head };
}

function splitRelations(text: string): { rest: string; synonyms: string[]; antonyms: string[]; example?: string } {
  let rest = text;
  const synonyms: string[] = [];
  const antonyms: string[] = [];
  let example: string | undefined;
  const take = (re: RegExp, sink: string[]) => {
    rest = rest.replace(re, (_m, list: string) => {
      sink.push(...list.split(/[,/;]/).map((s) => s.trim()).filter(Boolean));
      return "";
    });
  };
  take(/\(?\b(?:syn(?:onyms?)?|≈)\.?:?\s*([^()|]+?)\)?(?=\s*(?:\(|\b(?:ant|opp)|$|\|))/i, synonyms);
  take(/\(?\b(?:ant(?:onyms?)?|opp(?:osite)?|≠)\.?:?\s*([^()|]+?)\)?(?=\s*(?:\(|$|\|))/i, antonyms);
  rest = rest.replace(/\(?\b(?:e\.g\.|eg|ex(?:ample)?|z\.\s?b\.)\s*:?\s*([^()]+)\)?/i, (_m, ex: string) => {
    example = ex.trim();
    return "";
  });
  return { rest: collapseSpaces(rest).replace(/[;,|]+$/, "").trim(), synonyms, antonyms, example };
}

function assignMeaning(c: ParsedCandidate, meaning: string) {
  const lang = languageOf(meaning);
  if (lang === 1) c.translationDe = meaning;
  else if (lang === -1) c.definitionEn = meaning;
  else if (meaning.split(/\s+/).length <= 2) {
    c.translationDe = meaning;
    c.uncertain.push("Unsure whether the meaning is German or English");
  } else {
    c.definitionEn = meaning;
    c.uncertain.push("Unsure whether the meaning is German or English");
  }
}

const SEPARATORS = [/\s+[—–]\s+/, /\s+-{1,2}\s+/, /\s*=\s*/, /\t+/, /\s*:\s+/, /\s+→\s+/, /\s*\|\s*/];

function isHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^(topic|thema|unit|chapter|kapitel)\b/i.test(t) && !SEPARATORS.slice(0, 3).some((s) => s.test(t))) return true;
  if (/:$/.test(t) && t.split(/\s+/).length <= 6) return true;
  if (/^[A-ZÄÖÜ0-9 &/,-]{4,}$/.test(t) && /[A-Z]{3}/.test(t)) return true;
  // short line without separator followed by a separated line
  return (
    t.split(/\s+/).length <= 5 &&
    /^[A-ZÄÖÜ]/.test(t) &&
    !SEPARATORS.some((s) => s.test(t)) &&
    !!next &&
    SEPARATORS.some((s) => s.test(next))
  );
}

function cleanHeading(line: string) {
  return line.trim().replace(/^#+\s*/, "").replace(/:$/, "").trim();
}

function stripBullet(line: string) {
  return line.replace(/^\s*(?:[-*•▪◦·]|\d{1,3}[.)]|[a-z][.)])\s+/i, "");
}

const HEADER_ALIASES: Record<string, keyof ParsedCandidate> = {
  word: "headword", term: "headword", english: "headword", headword: "headword", vocabulary: "headword",
  expression: "headword", phrase: "headword", englisch: "headword", vokabel: "headword", wort: "headword",
  german: "translationDe", deutsch: "translationDe", translation: "translationDe", übersetzung: "translationDe",
  bedeutung: "translationDe",
  definition: "definitionEn", meaning: "definitionEn", explanation: "definitionEn", paraphrase: "definitionEn",
  example: "example", examples: "example", sentence: "example", beispiel: "example", "example sentence": "example",
  synonyms: "synonyms", synonym: "synonyms", antonyms: "antonyms", antonym: "antonyms",
  pos: "partOfSpeech", "part of speech": "partOfSpeech", wortart: "partOfSpeech",
};

function parseTable(lines: string[], delim: string, notes: string[]): ParsedCandidate[] {
  const rows = lines.map((l) => parseCsvLine(l, delim));
  const header = rows[0].map((h) => HEADER_ALIASES[h.toLowerCase().trim()]);
  const hasHeader = header.filter(Boolean).length >= 2 && header[0] !== undefined;
  const body = hasHeader ? rows.slice(1) : rows;
  if (hasHeader) notes.push(`Detected a header row: ${rows[0].join(", ")}`);
  const out: ParsedCandidate[] = [];
  body.forEach((cells, i) => {
    const raw = lines[i + (hasHeader ? 1 : 0)];
    if (cells.every((c) => !c)) return;
    const c: ParsedCandidate = { headword: "", uncertain: [], raw };
    if (hasHeader) {
      header.forEach((field, idx) => {
        const v = cells[idx]?.trim();
        if (!field || !v) return;
        if (field === "synonyms" || field === "antonyms") c[field] = v.split(/[,/;]/).map((s) => s.trim()).filter(Boolean);
        else (c as Record<string, unknown>)[field] = v;
      });
    } else {
      c.headword = cells[0] ?? "";
      cells.slice(1).filter(Boolean).forEach((cell, idx) => {
        if (idx === 0) assignMeaning(c, cell);
        else if (idx === 1 && !c.definitionEn && languageOf(cell) <= 0 && cell.split(/\s+/).length < 12) c.definitionEn = cell;
        else if (idx === 1 && !c.translationDe && languageOf(cell) === 1) c.translationDe = cell;
        else if (!c.example && /\s/.test(cell) && /[.!?]$/.test(cell)) c.example = cell;
        else c.uncertain.push(`Extra column not assigned: "${cell}"`);
      });
    }
    finish(c, out);
  });
  return out;
}

function finish(c: ParsedCandidate, out: ParsedCandidate[]) {
  const pos = extractPos(collapseSpaces(c.headword));
  c.headword = pos.head.replace(/^["']|["']$/g, "").trim();
  c.partOfSpeech ??= pos.pos;
  if (!c.headword) {
    c.uncertain.push("No word found on this line");
  }
  if (c.headword.length > 80) c.uncertain.push("Very long entry: is this really one vocabulary item?");
  if (/[�□]|\?\?/.test(c.raw)) c.uncertain.push("Contains unreadable characters (check the original)");
  if (!c.translationDe && !c.definitionEn) c.uncertain.push("No meaning found");
  out.push(c);
}

export function parseVocabularyText(input: string): ParseResult {
  const text = normalizeTypography(input).replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const nonEmpty = lines.filter((l) => l.trim());
  const notes: string[] = [];
  if (!nonEmpty.length) return { format: "empty", candidates: [], headings: [], notes: ["Nothing to import"] };

  // Table formats: most lines share a delimiter and the same column count.
  for (const delim of ["\t", ";", ","]) {
    const counts = nonEmpty.map((l) => parseCsvLine(l, delim).length);
    const withDelim = counts.filter((n) => n >= 2).length;
    const mode = counts.sort((a, b) => counts.filter((x) => x === a).length - counts.filter((x) => x === b).length).pop()!;
    const consistent = nonEmpty.filter((l) => {
      const n = parseCsvLine(l, delim).length;
      return n >= 2 && n <= mode; // trailing empty cells may have been trimmed
    }).length;
    const looksLikeProse = delim === "," && nonEmpty.some((l) => /\s[—–-]\s|:\s/.test(l));
    if (mode >= 2 && withDelim / nonEmpty.length >= 0.8 && consistent / nonEmpty.length >= 0.8 && !looksLikeProse) {
      notes.push(`Detected a ${delim === "\t" ? "tab-separated" : delim === ";" ? "semicolon-separated" : "comma-separated"} table with ${mode} columns`);
      const candidates = parseTable(nonEmpty, delim, notes);
      return { format: "table", candidates, headings: [], notes };
    }
  }

  const candidates: ParsedCandidate[] = [];
  const headings: string[] = [];
  let heading: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;
    const nextLine = lines.slice(i + 1).find((l) => l.trim());
    const line = stripBullet(rawLine.trim());

    // Continuation lines attach to the previous entry.
    const prev = candidates[candidates.length - 1];
    const indent = (s: string) => s.length - s.trimStart().length;
    const deeper = !!prev && indent(rawLine) > indent(prev.raw.split("\n")[0]);
    if (prev && (deeper || /^(e\.g\.|eg|ex(ample)?|z\.\s?b\.)\b/i.test(line))) {
      const rel = splitRelations(line);
      if (rel.example || /^(e\.g\.|ex)/i.test(line)) prev.example ??= rel.example ?? line.replace(/^(e\.g\.|ex(ample)?)[:.]?\s*/i, "");
      if (rel.synonyms.length) prev.synonyms = [...(prev.synonyms ?? []), ...rel.synonyms];
      if (rel.antonyms.length) prev.antonyms = [...(prev.antonyms ?? []), ...rel.antonyms];
      if (!rel.example && !rel.synonyms.length && !rel.antonyms.length && /[.!?]$/.test(line) && line.split(/\s+/).length > 4) {
        prev.example ??= line;
      }
      prev.raw += "\n" + rawLine;
      continue;
    }
    if (isHeading(line, nextLine && stripBullet(nextLine.trim()))) {
      heading = cleanHeading(line);
      headings.push(heading);
      continue;
    }
    const c: ParsedCandidate = { headword: "", uncertain: [], raw: rawLine, heading };
    const sep = SEPARATORS.find((s) => s.test(line));
    if (!sep) {
      const { rest, synonyms, antonyms, example } = splitRelations(line);
      const paren = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(rest);
      if (paren && !extractPos(rest).pos) {
        c.headword = paren[1];
        assignMeaning(c, paren[2]);
      } else c.headword = rest;
      if (synonyms.length) c.synonyms = synonyms;
      if (antonyms.length) c.antonyms = antonyms;
      if (example) c.example = example;
      finish(c, candidates);
      continue;
    }
    const parts = line.split(sep).map((p) => p.trim()).filter(Boolean);
    c.headword = parts[0] ?? "";
    const meanings = parts.slice(1);
    for (const part of meanings) {
      const rel = splitRelations(part);
      if (rel.synonyms.length) c.synonyms = [...(c.synonyms ?? []), ...rel.synonyms];
      if (rel.antonyms.length) c.antonyms = [...(c.antonyms ?? []), ...rel.antonyms];
      if (rel.example) c.example ??= rel.example;
      if (!rel.rest) continue;
      if (/[.!?]$/.test(rel.rest) && rel.rest.split(/\s+/).length >= 6 && (c.translationDe || c.definitionEn)) {
        c.example ??= rel.rest;
      } else if (!c.translationDe && !c.definitionEn) {
        assignMeaning(c, rel.rest);
      } else if (!c.translationDe && languageOf(rel.rest) === 1) {
        c.translationDe = rel.rest;
      } else if (!c.definitionEn && languageOf(rel.rest) <= 0) {
        c.definitionEn = rel.rest;
      } else {
        c.uncertain.push(`Extra text not assigned: "${rel.rest}"`);
      }
    }
    finish(c, candidates);
  }
  const fmt = candidates.every((c) => c.uncertain.length === 0) ? "separated" : "mixed";
  if (headings.length) notes.push(`Found ${headings.length} heading(s); they are suggested as topics`);
  const unsure = candidates.filter((c) => c.uncertain.length).length;
  if (unsure) notes.push(`${unsure} line(s) need a quick check`);
  return { format: fmt, candidates, headings, notes };
}
