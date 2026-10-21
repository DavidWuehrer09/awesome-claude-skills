import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { learningStates, vocabEntries, vocabExamples } from "@/db/schema";
import { inflectionPattern, normalizeHeadword } from "@/lib/text";

/**
 * Data for the Tools page: collocation bank, phrasal verbs and idioms,
 * confusable pairs and "practice from a text". Everything comes from the
 * learner's own entries; nothing is generated here.
 */

type Side = { id: string | null; headword: string; partOfSpeech: string | null; meaning: string | null; example: string | null };
export type ConfusablePair = { key: string; a: Side; b: Side; distinctions: string[]; lapses: number };

const PHRASAL_OR_IDIOM = /phrasal|idiom/i;

export async function toolsData(db: Db, userId: string) {
  const rows = await db.select({ entry: vocabEntries, lapses: learningStates.lapses, difficult: learningStates.markedDifficult })
    .from(vocabEntries)
    .leftJoin(learningStates, and(eq(learningStates.entryId, vocabEntries.id), eq(learningStates.userId, userId)))
    .where(eq(vocabEntries.userId, userId))
    .orderBy(asc(vocabEntries.normalized));
  const examples = await db.select({ entryId: vocabExamples.entryId, text: vocabExamples.text }).from(vocabExamples)
    .where(eq(vocabExamples.userId, userId)).orderBy(asc(vocabExamples.createdAt));
  const firstExample = new Map<string, string>();
  for (const ex of examples) if (!firstExample.has(ex.entryId)) firstExample.set(ex.entryId, ex.text);

  const side = (e: typeof vocabEntries.$inferSelect): Side => ({
    id: e.id, headword: e.headword, partOfSpeech: e.partOfSpeech, meaning: e.definitionEn ?? e.translationDe, example: firstExample.get(e.id) ?? null,
  });

  const collocations = rows.filter((r) => r.entry.collocations.length)
    .map((r) => ({ id: r.entry.id, headword: r.entry.headword, partOfSpeech: r.entry.partOfSpeech, collocations: r.entry.collocations }));

  const phrasal = rows.filter((r) => PHRASAL_OR_IDIOM.test(r.entry.partOfSpeech ?? ""))
    .map((r) => ({ ...side(r.entry), kind: /idiom/i.test(r.entry.partOfSpeech ?? "") ? "idiom" as const : "phrasal verb" as const, lapses: r.lapses ?? 0 }));

  const byNorm = new Map(rows.map((r) => [r.entry.normalized, r]));
  const pairs = new Map<string, ConfusablePair>();
  for (const r of rows) {
    for (const c of r.entry.confusables) {
      const otherNorm = normalizeHeadword(c.word);
      if (!otherNorm || otherNorm === r.entry.normalized) continue;
      const key = [r.entry.normalized, otherNorm].sort().join(" ↔ ");
      const other = byNorm.get(otherNorm);
      const existing = pairs.get(key);
      if (existing) {
        if (c.distinction && !existing.distinctions.includes(c.distinction)) existing.distinctions.push(c.distinction);
        continue;
      }
      pairs.set(key, {
        key,
        a: side(r.entry),
        b: other ? side(other.entry) : { id: null, headword: c.word, partOfSpeech: null, meaning: null, example: null },
        distinctions: c.distinction ? [c.distinction] : [],
        lapses: (r.lapses ?? 0) + (other?.lapses ?? 0),
      });
    }
  }
  const confusables = [...pairs.values()].sort((x, y) => y.lapses - x.lapses || x.key.localeCompare(y.key));
  return { collocations, phrasal, confusables };
}

// ---------------------------------------------------------------- practice from a text

/** Frequent words of 6+ letters that are not worth suggesting as new vocabulary. */
const COMMON = new Set(`
about above across action actually against almost already although always amount animal another answer anyone anything appear around asked became because become before begin behind being believe better between beyond bought brought called cannot certain change children choose clearly coming common company consider continue could course create decide decided different during either enough especially evening every everyone everything example family father finally follow following friend friends further future general getting given going government great ground happen happened having health himself however important include including increase indeed inside instead interest itself knowledge language little looked making market matter maybe member minute moment morning mother myself nature nearly necessary needed neither never nothing notice number office often others outside parents people perhaps period person picture places played please point police possible power present pretty probably problem problems process produce program public question quickly rather really reason recent remember report result return right saying school second seemed seems should showed simple simply since situation small social someone something sometimes special started still story strong student students study subject suddenly support surely system taking talked teacher thing things think thinking those though thought through today together toward towards trying turned under understand until upon usually various wanted watch water where whether which while whole within without woman women words working world would write writing written years yesterday young yourself
`.trim().split(/\s+/));

export type TextAnalysis = {
  found: { id: string; headword: string; count: number; forms: string[] }[];
  spans: { start: number; end: number; entryId: string }[];
  candidates: { word: string; count: number }[];
};

/** Which of the learner's words occur in the text (inflection-tolerant), plus unknown candidate words. */
export async function analyseText(db: Db, userId: string, text: string): Promise<TextAnalysis> {
  const entries = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const spans: TextAnalysis["spans"] = [];
  const found: TextAnalysis["found"] = [];
  for (const e of entries) {
    const re = inflectionPattern(e.headword);
    if (!re) continue;
    const global = new RegExp(re.source, "gi");
    const forms = new Set<string>();
    let count = 0;
    for (const m of text.matchAll(global)) {
      count++;
      forms.add(m[0]);
      spans.push({ start: m.index, end: m.index + m[0].length, entryId: e.id });
    }
    if (count) found.push({ id: e.id, headword: e.headword, count, forms: [...forms].slice(0, 5) });
  }
  // Longest match first; drop overlapping spans so the highlight stays readable.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const clean: typeof spans = [];
  for (const s of spans) if (!clean.length || s.start >= clean[clean.length - 1].end) clean.push(s);

  const covered = (i: number) => clean.some((s) => i >= s.start && i < s.end);
  const known = new Set(entries.map((e) => normalizeHeadword(e.headword)));
  const counts = new Map<string, { count: number; lower: boolean }>();
  for (const m of text.matchAll(/[A-Za-z][a-z]+(?:-[a-z]+)*/g)) {
    const word = m[0].toLowerCase();
    if (word.length < 6 || COMMON.has(word) || known.has(word) || covered(m.index)) continue;
    const c = counts.get(word) ?? { count: 0, lower: false };
    c.count++;
    if (m[0][0] === m[0][0].toLowerCase()) c.lower = true;
    counts.set(word, c);
  }
  const candidates = [...counts.entries()]
    // Words that only ever appear capitalised are most likely names.
    .filter(([, c]) => c.lower)
    .map(([word, c]) => ({ word, count: c.count }))
    .sort((a, b) => b.count - a.count || b.word.length - a.word.length)
    .slice(0, 30);
  return { found: found.sort((a, b) => b.count - a.count), spans: clean, candidates };
}
