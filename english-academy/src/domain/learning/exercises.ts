/**
 * Exercise generation from a word's own data. Every exercise here is built
 * deterministically (no AI), so review works offline and without a provider.
 * AI-generated exercise types (translation, error correction, transformation,
 * multi-context cloze) live in src/server/ai/features.
 */
import type { MasteryDimension, MasteryMap } from "@/db/schema";
import { inflectionPattern, normalizeHeadword } from "@/lib/text";
import type { AnswerSpec } from "./answers";

export type EntryLite = {
  id: string;
  headword: string;
  partOfSpeech: string | null;
  translationDe: string | null;
  definitionEn: string | null;
  register?: string | null;
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  wordFamily: { form: string; pos?: string }[];
  confusables: { word: string; distinction: string }[];
  acceptedAnswers: string[];
  examples: string[];
  topicIds?: string[];
};

export type ExerciseKind =
  | "flip_en_de"
  | "flip_de_en"
  | "typed_de_en"
  | "typed_definition"
  | "meaning_choice"
  | "cloze"
  | "collocation"
  | "nuance"
  | "synonym_choice"
  | "antonym_choice"
  | "word_family"
  | "production"
  | "meaning_en_de";

export type Exercise = {
  id: string;
  entryId: string;
  kind: ExerciseKind;
  dimension: MasteryDimension;
  title: string;
  prompt: string;
  context?: string;
  answer:
    | { type: "self" }
    | { type: "typed"; spec: AnswerSpec }
    | { type: "choice"; options: string[]; correct: number }
    | { type: "free"; targetWord: string };
  hint?: string;
  explanation?: string;
  recognitionOnly: boolean;
  reveal: {
    headword: string;
    translationDe: string | null;
    definitionEn: string | null;
    example: string | null;
    note: string | null;
  };
};

export const KIND_LABEL: Record<ExerciseKind, string> = {
  flip_en_de: "English → German",
  flip_de_en: "German → English",
  typed_de_en: "Typed recall",
  typed_definition: "Definition → word",
  meaning_choice: "Recognition",
  cloze: "Contextual recall",
  collocation: "Collocation recall",
  nuance: "Nuance discrimination",
  synonym_choice: "Synonyms",
  antonym_choice: "Antonyms",
  word_family: "Word family",
  production: "Active production",
  meaning_en_de: "EN → DE meaning",
};

// ---------------------------------------------------------------- seeded randomness

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- helpers

function reveal(e: EntryLite, note: string | null = null) {
  return {
    headword: e.headword,
    translationDe: e.translationDe,
    definitionEn: e.definitionEn,
    example: e.examples[0] ?? null,
    note,
  };
}

function headwordAnswers(e: EntryLite): string[] {
  return [e.headword, ...e.acceptedAnswers];
}

function firstLetterHint(word: string) {
  return word
    .split(" ")
    .map((w) => (w.length <= 2 ? w : w[0] + "·".repeat(Math.min(w.length - 1, 8))))
    .join(" ");
}

/** Blank the headword (inflected form) out of a sentence. */
export function makeCloze(sentence: string, headword: string): { text: string; answer: string } | null {
  const re = inflectionPattern(headword);
  if (!re) return null;
  const m = re.exec(sentence);
  if (!m) return null;
  return { text: sentence.slice(0, m.index) + "_____" + sentence.slice(m.index + m[0].length), answer: m[0] };
}

function distractorWords(e: EntryLite, pool: EntryLite[], random: () => number, exclude: string[], n = 3): string[] {
  const banned = new Set([e.headword, ...e.synonyms, ...e.antonyms, ...exclude].map(normalizeHeadword));
  const candidates = pool.filter((p) => p.id !== e.id && !banned.has(normalizeHeadword(p.headword)));
  const samePos = candidates.filter((p) => p.partOfSpeech && p.partOfSpeech === e.partOfSpeech);
  const source = samePos.length >= n ? samePos : candidates;
  return shuffle(source, random).slice(0, n).map((p) => p.headword);
}

/**
 * Accepted German answers for an EN→DE meaning check: every listed translation
 * ("verschärfen, verschlimmern"), with and without bracketed additions.
 */
export function germanMeaningAnswers(translationDe: string): string[] {
  const parts = translationDe
    .split(/[,;/]|\s+oder\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) {
    out.add(p);
    const bare = p.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    if (bare) out.add(bare);
  }
  return [...out];
}

// ---------------------------------------------------------------- generators

type Gen = (e: EntryLite, pool: EntryLite[], random: () => number, id: string) => Exercise | null;

const generators: Record<ExerciseKind, Gen> = {
  flip_en_de: (e, _p, _r, id) =>
    e.translationDe || e.definitionEn
      ? {
          id, entryId: e.id, kind: "flip_en_de", dimension: "meaning", title: KIND_LABEL.flip_en_de,
          prompt: e.headword, context: e.partOfSpeech ?? undefined, answer: { type: "self" }, recognitionOnly: false,
          reveal: reveal(e),
        }
      : null,
  flip_de_en: (e, _p, _r, id) =>
    e.translationDe
      ? {
          id, entryId: e.id, kind: "flip_de_en", dimension: "meaning", title: KIND_LABEL.flip_de_en,
          prompt: e.translationDe, answer: { type: "self" }, recognitionOnly: false, reveal: reveal(e),
        }
      : null,
  typed_de_en: (e, _p, _r, id) =>
    e.translationDe
      ? {
          id, entryId: e.id, kind: "typed_de_en", dimension: "spelling", title: "Type the English word",
          prompt: e.translationDe, context: e.partOfSpeech ?? undefined,
          answer: { type: "typed", spec: { expected: headwordAnswers(e), alternatives: e.synonyms } },
          hint: firstLetterHint(e.headword), recognitionOnly: false, reveal: reveal(e),
        }
      : null,
  typed_definition: (e, _p, _r, id) =>
    e.definitionEn
      ? {
          id, entryId: e.id, kind: "typed_definition", dimension: "meaning", title: "Which word matches this definition?",
          prompt: e.definitionEn, context: e.partOfSpeech ?? undefined,
          answer: { type: "typed", spec: { expected: headwordAnswers(e), alternatives: e.synonyms } },
          hint: firstLetterHint(e.headword), recognitionOnly: false, reveal: reveal(e),
        }
      : null,
  meaning_choice: (e, pool, random, id) => {
    const meaning = e.translationDe ?? e.definitionEn;
    if (!meaning) return null;
    const field = e.translationDe ? "translationDe" : "definitionEn";
    const others = shuffle(pool.filter((p) => p.id !== e.id && p[field]), random).slice(0, 3).map((p) => p[field] as string);
    if (others.length < 2) return null;
    const options = shuffle([meaning, ...others], random);
    return {
      id, entryId: e.id, kind: "meaning_choice", dimension: "recognition", title: "What does it mean?",
      prompt: e.headword, answer: { type: "choice", options, correct: options.indexOf(meaning) }, recognitionOnly: true,
      reveal: reveal(e),
    };
  },
  cloze: (e, _p, random, id) => {
    const contexts = shuffle(e.examples, random);
    for (const sentence of contexts) {
      const c = makeCloze(sentence, e.headword);
      if (c) {
        return {
          id, entryId: e.id, kind: "cloze", dimension: "context", title: "Complete the sentence",
          prompt: c.text, context: e.translationDe ?? e.definitionEn ?? undefined,
          answer: { type: "typed", spec: { expected: [c.answer], alternatives: [], formSensitive: true } },
          hint: firstLetterHint(c.answer), recognitionOnly: false, reveal: { ...reveal(e), example: sentence },
        };
      }
    }
    return null;
  },
  collocation: (e, _p, random, id) => {
    for (const col of shuffle(e.collocations, random)) {
      const c = makeCloze(col, e.headword);
      if (c && c.text.replace("_____", "").trim()) {
        return {
          id, entryId: e.id, kind: "collocation", dimension: "collocation", title: "Complete the collocation",
          prompt: c.text, context: e.translationDe ?? e.definitionEn ?? undefined,
          answer: { type: "typed", spec: { expected: [c.answer], alternatives: [], formSensitive: true } },
          hint: firstLetterHint(c.answer), recognitionOnly: false,
          reveal: reveal(e, `Collocation: ${col}`),
        };
      }
    }
    return null;
  },
  nuance: (e, _p, random, id) => {
    if (!e.confusables.length) return null;
    const sentence = e.examples.map((s) => makeCloze(s, e.headword)).find(Boolean);
    if (!sentence) return null;
    const options = shuffle([e.headword, ...e.confusables.slice(0, 3).map((c) => c.word)], random);
    return {
      id, entryId: e.id, kind: "nuance", dimension: "context", title: "Choose the best word",
      prompt: sentence.text, answer: { type: "choice", options, correct: options.indexOf(e.headword) },
      explanation: e.confusables.map((c) => `${c.word}: ${c.distinction}`).join("\n"),
      recognitionOnly: true, reveal: reveal(e),
    };
  },
  synonym_choice: (e, pool, random, id) => {
    if (!e.synonyms.length) return null;
    const syn = e.synonyms[Math.floor(random() * e.synonyms.length)];
    const distractors = distractorWords(e, pool, random, [syn]);
    if (distractors.length < 2) return null;
    const options = shuffle([syn, ...distractors], random);
    return {
      id, entryId: e.id, kind: "synonym_choice", dimension: "meaning", title: `Closest in meaning to “${e.headword}”`,
      prompt: e.headword, answer: { type: "choice", options, correct: options.indexOf(syn) },
      explanation: e.confusables.find((c) => normalizeHeadword(c.word) === normalizeHeadword(syn))?.distinction ??
        "Near-synonyms are rarely identical: check register, intensity and typical collocations before swapping them.",
      recognitionOnly: true, reveal: reveal(e),
    };
  },
  antonym_choice: (e, pool, random, id) => {
    if (!e.antonyms.length) return null;
    const ant = e.antonyms[0];
    const distractors = distractorWords(e, pool, random, [ant]);
    if (distractors.length < 2) return null;
    const options = shuffle([ant, ...distractors], random);
    return {
      id, entryId: e.id, kind: "antonym_choice", dimension: "meaning", title: `Opposite of “${e.headword}”`,
      prompt: e.headword, answer: { type: "choice", options, correct: options.indexOf(ant) }, recognitionOnly: true,
      reveal: reveal(e),
    };
  },
  word_family: (e, _p, random, id) => {
    const forms = e.wordFamily.filter((f) => f.pos && normalizeHeadword(f.form) !== normalizeHeadword(e.headword));
    if (!forms.length) return null;
    const f = forms[Math.floor(random() * forms.length)];
    return {
      id, entryId: e.id, kind: "word_family", dimension: "grammar", title: "Word family",
      prompt: `Give the ${f.pos} related to “${e.headword}”`,
      answer: { type: "typed", spec: { expected: [f.form], tolerance: "strict" } },
      hint: firstLetterHint(f.form), recognitionOnly: false,
      reveal: reveal(e, `Family: ${e.wordFamily.map((w) => `${w.form}${w.pos ? ` (${w.pos})` : ""}`).join(", ")}`),
    };
  },
  production: (e, _p, _r, id) => ({
    id, entryId: e.id, kind: "production", dimension: "production", title: "Use it in your own sentence",
    prompt: `Write an original sentence with “${e.headword}” that makes its meaning clear.`,
    context: [e.definitionEn, e.collocations[0] ? `Try: ${e.collocations[0]}` : null].filter(Boolean).join(" · "),
    answer: { type: "free", targetWord: e.headword }, recognitionOnly: false, reveal: reveal(e),
  }),
  meaning_en_de: (e, _p, random, id) => {
    if (!e.translationDe) return null;
    for (const sentence of shuffle(e.examples, random)) {
      const m = inflectionPattern(e.headword)?.exec(sentence);
      if (!m) continue;
      return {
        id, entryId: e.id, kind: "meaning_en_de", dimension: "meaning", title: "What does the word mean here? (German)",
        prompt: sentence, context: `Give the German meaning of “${m[0]}” in this sentence.`,
        answer: { type: "typed", spec: { expected: germanMeaningAnswers(e.translationDe) } },
        recognitionOnly: false, reveal: { ...reveal(e), example: sentence },
      };
    }
    return null;
  },
};

export function generateExercise(kind: ExerciseKind, e: EntryLite, pool: EntryLite[], seed: string): Exercise | null {
  return generators[kind](e, pool, rng(hashString(`${seed}:${e.id}:${kind}`)), `${e.id}:${kind}:${hashString(seed)}`);
}

export function availableKinds(e: EntryLite, pool: EntryLite[]): ExerciseKind[] {
  return (Object.keys(generators) as ExerciseKind[]).filter((k) => generateExercise(k, e, pool, "probe") !== null);
}

/**
 * Pick the exercise type for a word. Unfamiliar words start with meaning,
 * difficult ones get recall/spelling/context/production, familiar ones get
 * the demanding types. Overconfidence pushes towards typed recall.
 */
export function chooseKind(
  e: EntryLite,
  pool: EntryLite[],
  info: { reps: number; lapses: number; stability: number; mastery: MasteryMap; overconfidence: number; difficult: boolean },
  seed: string,
  allowed?: ExerciseKind[],
): Exercise | null {
  const random = rng(hashString(`${seed}:${e.id}:choose`));
  const avail = new Set(availableKinds(e, pool).filter((k) => !allowed || allowed.includes(k)));
  let preference: ExerciseKind[];
  const m = info.mastery;
  if (info.reps === 0) preference = ["flip_en_de", "meaning_choice", "typed_definition"];
  else if (info.difficult || info.lapses >= 3) preference = shuffle(["typed_de_en", "typed_definition", "cloze", "collocation", "production"], random);
  else if (info.overconfidence >= 2) preference = ["typed_de_en", "typed_definition", "cloze"];
  else if (info.stability < 4) preference = shuffle(["flip_de_en", "typed_de_en", "typed_definition", "meaning_choice", "synonym_choice", "meaning_en_de"], random);
  else {
    // familiar: demanding types, weighted towards the weakest dimension
    const weakCol = (m.collocation?.score ?? 0) < 0.6;
    const weakProd = (m.production?.score ?? 0) < 0.6;
    preference = shuffle(["cloze", "typed_de_en", "nuance", "word_family", "antonym_choice"], random);
    if (weakCol) preference.unshift("collocation");
    if (weakProd && info.stability > 10) preference.unshift("production");
  }
  const fallback: ExerciseKind[] = ["typed_de_en", "typed_definition", "flip_en_de", "flip_de_en", "cloze", "production"];
  const kind = [...preference, ...fallback].find((k) => avail.has(k));
  return kind ? generateExercise(kind, e, pool, seed) : null;
}

/** Which mastery dimensions an attempt provides evidence for, and how strongly. */
export function evidenceFor(ex: Pick<Exercise, "kind" | "dimension">, success: number): Partial<Record<MasteryDimension, number>> {
  const ev: Partial<Record<MasteryDimension, number>> = { [ex.dimension]: success };
  if (ex.kind === "typed_de_en" || ex.kind === "typed_definition") {
    ev.meaning = success;
    ev.spelling = success;
    ev.recognition = Math.max(success, 0.5);
  }
  if (ex.kind === "cloze") ev.grammar = success;
  if (ex.kind === "flip_en_de" || ex.kind === "meaning_en_de") ev.recognition = success;
  if (ex.kind === "production") ev.grammar = success;
  return ev;
}

// ---------------------------------------------------------------- in-session retry

/** Kinds for retrying a missed word, most useful first: recall in context before recognition. */
const RETRY_ORDER: ExerciseKind[] = [
  "cloze", "collocation", "typed_definition", "typed_de_en", "meaning_en_de", "production",
  "word_family", "nuance", "meaning_choice", "flip_de_en", "flip_en_de", "synonym_choice", "antonym_choice",
];

/**
 * Exercise kinds for in-session retries of a missed word: each retry uses a
 * different kind than the miss (and than the other retry), so the learner
 * meets the word from another angle instead of repeating the same card.
 * A session restricted to several kinds (e.g. the sprint) keeps its
 * restriction; a single-kind session may retry with any other kind.
 * Empty when the word supports no other kind (the runner then repeats the card).
 */
export function retryKinds(missed: ExerciseKind, available: ExerciseKind[], allowed?: ExerciseKind[], count = 2): ExerciseKind[] {
  const scope = allowed && allowed.length > 1 ? allowed : undefined;
  const avail = new Set(available.filter((k) => !scope || scope.includes(k)));
  return RETRY_ORDER.filter((k) => k !== missed && avail.has(k)).slice(0, count);
}

export function retryExercises(missed: Exercise, e: EntryLite, pool: EntryLite[], seed: string, allowed?: ExerciseKind[]): Exercise[] {
  return retryKinds(missed.kind, availableKinds(e, pool), allowed)
    .map((k) => generateExercise(k, e, pool, `${seed}:retry`))
    .filter((x): x is Exercise => !!x);
}

// ---------------------------------------------------------------- adaptive challenge

/** Difficulty tier of each kind for the adaptive Mixed Challenge (1 = recognition … 4 = production). */
export const KIND_TIER: Record<ExerciseKind, 1 | 2 | 3 | 4> = {
  flip_en_de: 1, meaning_choice: 1, synonym_choice: 1, antonym_choice: 1,
  flip_de_en: 2, nuance: 2, typed_definition: 2, meaning_en_de: 2,
  typed_de_en: 3, cloze: 3, word_family: 3,
  collocation: 4, production: 4,
};

export const ADAPTIVE_START_TIER = 2;

/**
 * Current difficulty tier from the session's outcomes so far (deterministic):
 * two successes in a row move one tier up, an error moves one tier down,
 * a partly correct answer resets the streak without moving.
 */
export function adaptiveTier(outcomes: string[]): number {
  let tier = ADAPTIVE_START_TIER;
  let streak = 0;
  for (const o of outcomes) {
    if (o === "correct" || o === "alternative" || o === "typo") {
      streak++;
      if (streak >= 2) {
        tier = Math.min(4, tier + 1);
        streak = 0;
      }
    } else if (o === "partial") {
      streak = 0;
    } else {
      tier = Math.max(1, tier - 1);
      streak = 0;
    }
  }
  return tier;
}

/** One exercise per difficulty tier the word supports (seeded choice within a tier), easiest first. */
export function adaptiveVariants(e: EntryLite, pool: EntryLite[], seed: string, allowed?: ExerciseKind[]): Exercise[] {
  const random = rng(hashString(`${seed}:${e.id}:adaptive`));
  const avail = shuffle(availableKinds(e, pool).filter((k) => !allowed || allowed.includes(k)), random);
  const out: Exercise[] = [];
  for (const tier of [1, 2, 3, 4]) {
    const kind = avail.find((k) => KIND_TIER[k] === tier);
    const ex = kind ? generateExercise(kind, e, pool, seed) : null;
    if (ex) out.push(ex);
  }
  return out;
}

/** The variant closest to the wanted tier; on a tie the easier one. */
export function pickVariant(variants: Exercise[], tier: number): Exercise | undefined {
  let best: Exercise | undefined;
  for (const v of variants) {
    if (!best || Math.abs(KIND_TIER[v.kind] - tier) < Math.abs(KIND_TIER[best.kind] - tier)) best = v;
  }
  return best;
}
