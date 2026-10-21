/**
 * Deterministic typed-answer checking. AI judgement is used for free
 * production (sentences, translations) and, visibly labelled, as a second
 * opinion on a plain "wrong" verdict (is it a valid synonym here?); it never
 * silently overrules these verdicts. A learner can add an accepted answer to
 * a word explicitly; that change is stored on the entry (acceptedAnswers) and
 * is therefore traceable.
 */
import { levenshtein, normalizeTypography } from "@/lib/text";

export type Tolerance = "strict" | "normal" | "lenient";

export type Verdict =
  | { kind: "exact"; matched: string }
  | { kind: "alternative"; matched: string }
  | { kind: "typo"; matched: string; distance: number }
  | { kind: "wrong_form"; matched: string }
  | { kind: "confused"; withWord: string }
  | { kind: "wrong" }
  | { kind: "empty" };

export type AnswerSpec = {
  /** Correct answers (headword or exact inflected form for cloze). */
  expected: string[];
  /** Valid alternatives for this exercise (e.g. accepted synonyms for meaning recall). */
  alternatives?: string[];
  /** Other known words that must NOT be accepted as typos (affect/effect). */
  distractors?: string[];
  /** When the exercise tests a specific form, other forms of the same word are "wrong_form". */
  formSensitive?: boolean;
  tolerance?: Tolerance;
};

const PLACEHOLDERS = /\b(sth|sb|something|somebody|someone|one's|oneself|etw|jdn|jdm)\b\.?/gi;

export function normalizeAnswer(s: string): string {
  return normalizeTypography(s)
    .toLowerCase()
    .replace(PLACEHOLDERS, " ")
    .replace(/[“”"!?.,;:()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(to|the|a|an) /, "")
    .trim();
}

export function allowedDistance(length: number, tolerance: Tolerance): number {
  if (tolerance === "strict") return 0;
  const base = length <= 4 ? 0 : length <= 8 ? 1 : 2;
  return tolerance === "lenient" ? base + 1 : base;
}

function sameStem(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= Math.max(4, Math.floor(n * 0.7));
}

export function checkAnswer(input: string, spec: AnswerSpec): Verdict {
  const given = normalizeAnswer(input);
  if (!given) return { kind: "empty" };
  const tolerance = spec.tolerance ?? "normal";
  const expected = spec.expected.map((e) => ({ raw: e, n: normalizeAnswer(e) })).filter((e) => e.n);
  const alternatives = (spec.alternatives ?? []).map((e) => ({ raw: e, n: normalizeAnswer(e) })).filter((e) => e.n);

  for (const e of expected) if (given === e.n) return { kind: "exact", matched: e.raw };
  for (const a of alternatives) if (given === a.n) return { kind: "alternative", matched: a.raw };

  // A different real word the learner knows is a confusion, not a typo.
  for (const d of spec.distractors ?? []) {
    const dn = normalizeAnswer(d);
    if (dn && given === dn && !expected.some((e) => e.n === dn)) return { kind: "confused", withWord: d };
  }

  let best: { raw: string; d: number } | null = null;
  for (const e of [...expected, ...alternatives]) {
    const max = allowedDistance(e.n.length, tolerance);
    const d = levenshtein(given, e.n, max + 3);
    if (d <= max && (!best || d < best.d)) best = { raw: e.raw, d };
  }
  if (best) {
    const exp = expected.find((e) => e.raw === best!.raw);
    const isInflection = (a: string, b: string) => {
      const [short, long] = a.length < b.length ? [a, b] : [b, a];
      return long.startsWith(short.slice(0, Math.max(4, short.length - 1)));
    };
    if (spec.formSensitive && exp && given.length !== exp.n.length && isInflection(given, exp.n)) {
      return { kind: "wrong_form", matched: exp.raw };
    }
    return { kind: "typo", matched: best.raw, distance: best.d };
  }
  for (const e of expected) {
    if (sameStem(given, e.n)) return { kind: "wrong_form", matched: e.raw };
  }
  return { kind: "wrong" };
}

export function verdictToOutcome(v: Verdict): "correct" | "alternative" | "typo" | "partial" | "wrong" {
  switch (v.kind) {
    case "exact":
      return "correct";
    case "alternative":
      return "alternative";
    case "typo":
      return "typo";
    case "wrong_form":
      return "partial";
    default:
      return "wrong";
  }
}

export function verdictMessage(v: Verdict, expected: string): string {
  switch (v.kind) {
    case "exact":
      return "Correct.";
    case "alternative":
      return `Accepted: “${v.matched}” fits here. The target word was “${expected}”.`;
    case "typo":
      return `Almost: check the spelling (“${v.matched}”).`;
    case "wrong_form":
      return `Right word, wrong form: the context needs “${v.matched}”.`;
    case "confused":
      return `That is a different word (“${v.withWord}”). The answer is “${expected}”.`;
    case "empty":
      return `No answer. The answer is “${expected}”.`;
    default:
      return `Not quite. The answer is “${expected}”.`;
  }
}
