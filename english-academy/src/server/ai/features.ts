import "server-only";
import { z } from "zod";
import { proposeGroups } from "@/domain/vocab/organize";
import { parseVocabularyText } from "@/domain/vocab/parse";
import { inflectionPattern, normalizeHeadword, wordCount } from "@/lib/text";
import type { ImageInput } from "./anthropic";
import { examinerFeatures } from "./examiner-features";

/**
 * AI feature contracts. Each feature has a version (stored with every
 * request and result), an output schema compatible with structured outputs
 * (all fields required; optional values are nullable), a prompt, and a demo
 * implementation that is honest about what it did not evaluate.
 */

export const TEACHING_PRINCIPLES = `You are an expert teacher of advanced English (C1/C2) for a German Gymnasium student preparing for the Bavarian English Abitur at the increased level (Leistungsfach).
Principles:
- Distinguish genuine errors from awkward-but-understandable phrasing, unnatural collocations, register problems and mere stylistic preferences. Never present a preference as a rule; never invent rules.
- When several answers are acceptable, say so and explain the differences instead of declaring one uniquely correct.
- Prefer precise, natural English over ornate complexity ("controlled sophistication"). A simple, clear sentence can already be excellent.
- Quote the learner's own words exactly when referring to them.
- Be concise and actionable. British or American spelling are both acceptable if consistent.`;

const nullableStr = z.string().nullable();

// ---------------------------------------------------------------- enrich

export const enrichOutput = z.object({
  partOfSpeech: nullableStr,
  translationDe: nullableStr,
  definitionEn: z.string(),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  register: nullableStr,
  connotation: nullableStr,
  collocations: z.array(z.string()),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
  wordFamily: z.array(z.object({ form: z.string(), pos: z.string() })),
  patterns: z.array(z.string()),
  grammarNotes: nullableStr,
  ipa: nullableStr,
  commonMistakes: z.array(z.string()),
  confusables: z.array(z.object({ word: z.string(), distinction: z.string() })),
  idioms: z.array(z.string()),
  examples: z.array(z.object({ text: z.string(), kind: z.enum(["natural", "academic"]) })),
  uncertainty: nullableStr,
});
export type EnrichInput = { headword: string; partOfSpeech?: string | null; translationDe?: string | null; definitionEn?: string | null; context?: string | null; topic?: string | null };

// ---------------------------------------------------------------- import parsing (text or images)

export const parseListOutput = z.object({
  entries: z.array(z.object({
    headword: z.string(),
    translationDe: nullableStr,
    definitionEn: nullableStr,
    example: nullableStr,
    partOfSpeech: nullableStr,
    heading: nullableStr,
    uncertain: z.array(z.string()),
  })),
  unreadable: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ParseListInput = { text?: string; images?: ImageInput[]; pdfBase64?: string };

// ---------------------------------------------------------------- topic classification

export const classifyOutput = z.object({
  groups: z.array(z.object({ topic: z.string(), subtopic: nullableStr, keys: z.array(z.string()) })),
});
export type ClassifyInput = { items: { key: string; headword: string; meaning: string | null }[]; existingTopics: string[] };

// ---------------------------------------------------------------- answer evaluation

export const evaluateOutput = z.object({
  verdict: z.enum(["excellent", "correct", "acceptable", "needs_revision", "incorrect"]),
  score: z.number(),
  summary: z.string(),
  targetWordUse: z.array(z.object({
    word: z.string(), used: z.boolean(), correct: z.boolean().nullable(), natural: z.boolean().nullable(), comment: z.string(),
  })),
  issues: z.array(z.object({
    excerpt: z.string(),
    category: z.enum(["grammar", "vocabulary", "collocation", "register", "meaning", "clarity", "style", "spelling"]),
    severity: z.enum(["error", "unnatural", "suggestion"]),
    explanation: z.string(),
    suggestion: z.string(),
  })),
  hintQuestion: nullableStr,
  improvedVersion: nullableStr,
  alternatives: z.array(z.string()),
});
export type EvaluateInput = {
  task: "sentence" | "translation" | "transformation" | "error_correction" | "context_choice" | "production" | "writing_transfer" | "paragraph" | "sentence_lab";
  instructions: string;
  objective: string;
  targetWords: string[];
  learnerAnswer: string;
  sourceText?: string | null;
  referenceAnswers?: string[];
};

// ---------------------------------------------------------------- exercise generation

export const exerciseKindsAI = ["translation", "error_correction", "transformation", "context_choice", "cloze_contexts", "sentence_lab"] as const;
export const generateOutput = z.object({
  items: z.array(z.object({
    targetWord: nullableStr,
    prompt: z.string(),
    context: nullableStr,
    options: z.array(z.string()),
    answer: z.string(),
    acceptableAnswers: z.array(z.string()),
    explanation: z.string(),
  })),
});
export type GenerateInput = {
  kind: (typeof exerciseKindsAI)[number];
  entries: { headword: string; meaning: string | null; example?: string | null }[];
  topic?: string | null;
  count: number;
  focus?: string | null;
};

// ---------------------------------------------------------------- writing assessment

export const WRITING_DIMENSIONS = [
  "task_fulfilment", "argument", "structure", "analysis", "grammar", "vocabulary", "idiomaticity", "register", "evidence", "mechanics",
] as const;

export const assessOutput = z.object({
  summary: z.string(),
  rubricName: z.string(),
  dimensions: z.array(z.object({
    key: z.enum(WRITING_DIMENSIONS),
    level: z.enum(["excellent", "strong", "solid", "developing", "weak", "not_applicable"]),
    assessment: z.string(),
    evidence: z.array(z.string()),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    improvement: z.string(),
  })),
  annotations: z.array(z.object({
    id: z.string(),
    excerpt: z.string(),
    category: z.enum(["grammar", "vocabulary", "collocation", "register", "clarity", "argumentation", "structure", "evidence", "spelling", "punctuation"]),
    priority: z.enum(["meaning", "serious_grammar", "vocabulary_misuse", "unnatural", "structural", "optional"]),
    isError: z.boolean(),
    explanation: z.string(),
    suggestion: z.string(),
    question: nullableStr,
  })),
  strengths: z.array(z.string()),
  priorities: z.array(z.object({ rank: z.number(), focus: z.string(), action: z.string() })),
  vocabulary: z.object({
    targetUse: z.array(z.object({ word: z.string(), status: z.enum(["correct", "incorrect", "unnatural", "not_used", "not_needed"]), comment: z.string() })),
    missedOpportunities: z.array(z.object({ word: z.string(), where: z.string() })),
    simplerBetter: z.array(z.object({ excerpt: z.string(), simpler: z.string() })),
  }),
  exercise: z.object({ skill: z.string(), instruction: z.string(), items: z.array(z.string()) }),
  estimate: z.object({
    low: z.number(), high: z.number(), best: z.number().nullable(), explanation: z.string(), uncertainty: z.string(),
  }).nullable(),
  errorPatterns: z.array(z.object({ category: z.string(), count: z.number() })),
});
export type AssessInput = {
  section: string;
  taskType: string;
  title: string;
  instructions: string;
  sourceText: string | null;
  body: string;
  targetWords: string[];
  minWords: number | null;
  maxWords: number | null;
  wantEstimate: boolean;
  previousPatterns: string[];
  rubricNote: string;
};

// ---------------------------------------------------------------- prompts for writing

export const promptOutput = z.object({
  title: z.string(),
  instructions: z.string(),
  sourceText: nullableStr,
  sourceLabel: nullableStr,
  minWords: z.number().nullable(),
  maxWords: z.number().nullable(),
  notes: z.string(),
});
export type PromptInput = { section: string; taskType: string; topic: string; difficulty: string; targetWords: string[]; minutes: number | null };

// ---------------------------------------------------------------- mind maps & challenges

export const RELATIONS = ["synonym", "antonym", "family", "collocation", "related", "contrast", "confusable", "cause", "effect", "academic_phrase"] as const;
export const mindmapOutput = z.object({
  links: z.array(z.object({ from: z.string(), to: z.string(), relation: z.enum(RELATIONS), note: z.string() })),
});
export type MindmapInput = { topic: string; entries: { headword: string; meaning: string | null }[] };

export const challengeOutput = z.object({
  decision: z.enum(["upheld", "revised", "withdrawn"]),
  explanation: z.string(),
  revisedSuggestion: nullableStr,
});
export type ChallengeInput = { text: string; annotation: { excerpt: string; explanation: string; suggestion: string; category: string }; argument: string; mode: "challenge" | "clarify" };

// ---------------------------------------------------------------- typed-answer semantic check

export const answerCheckOutput = z.object({
  acceptable: z.boolean(),
  explanation: z.string(),
});
export type AnswerCheckInput = {
  exercise: string;
  prompt: string;
  context: string | null;
  targetWord: string;
  expected: string[];
  learnerAnswer: string;
  answerLanguage: "en" | "de";
};

// ---------------------------------------------------------------- feature registry

export type Feature<I, O extends z.ZodType> = {
  id: string;
  version: string;
  schema: O;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  system: string;
  user: (input: I) => string;
  images?: (input: I) => ImageInput[] | undefined;
  pdf?: (input: I) => string | undefined;
  /** Small, frequent task: may run on AI_FAST_MODEL to save cost. */
  fast?: boolean;
  /** Post-validation beyond the schema (e.g. quotes must exist). Return problems. */
  check?: (input: I, out: z.infer<O>) => string[];
  demo: (input: I) => z.infer<O>;
};

const json = (v: unknown) => JSON.stringify(v, null, 1);

export const features = {
  enrich: {
    id: "enrich", version: "enrich@1", fast: true, schema: enrichOutput, effort: "low", maxTokens: 4000,
    system: `${TEACHING_PRINCIPLES}
Task: enrich a vocabulary entry for the learner's personal dictionary. Keep definitions concise. Give 2-4 natural example sentences (at least one suitable for academic writing). Collocations must be genuinely frequent. Distinguish near-synonyms precisely in "confusables" (context, register, intensity). If you are unsure about any field, leave it empty/null and explain in "uncertainty"; never invent.`,
    user: (i: EnrichInput) => `Entry:\n${json(i)}\nRespect the meaning given by the learner if present.`,
    demo: (i: EnrichInput) => demoEnrich(i),
  } satisfies Feature<EnrichInput, typeof enrichOutput>,

  parseList: {
    id: "parseList", version: "parseList@1", schema: parseListOutput, effort: "low", maxTokens: 16000,
    system: `${TEACHING_PRINCIPLES}
Task: extract vocabulary entries from a school vocabulary list (text, photo or PDF). Preserve topic headings. Identify the English headword, German translation, English definition and example sentence where present. NEVER guess unreadable text: list it in "unreadable" and add a reason to the entry's "uncertain" list. Do not add words that are not in the source.`,
    user: (i: ParseListInput) => i.text ? `Vocabulary list:\n"""\n${i.text}\n"""` : "Extract the vocabulary from the attached material.",
    images: (i: ParseListInput) => i.images,
    pdf: (i: ParseListInput) => i.pdfBase64,
    demo: (i: ParseListInput) => {
      if (!i.text) throw new Error("demo_unsupported");
      const r = parseVocabularyText(i.text);
      return {
        entries: r.candidates.map((c) => ({
          headword: c.headword, translationDe: c.translationDe ?? null, definitionEn: c.definitionEn ?? null, example: c.example ?? null,
          partOfSpeech: c.partOfSpeech ?? null, heading: c.heading ?? null, uncertain: c.uncertain,
        })),
        unreadable: [],
        notes: ["Demo mode: rule-based parsing only."],
      };
    },
  } satisfies Feature<ParseListInput, typeof parseListOutput>,

  classify: {
    id: "classify", version: "classify@1", fast: true, schema: classifyOutput, effort: "low", maxTokens: 6000,
    system: `${TEACHING_PRINCIPLES}
Task: organise vocabulary into useful topics and subtopics for an English Abitur course, based on the actual words (not a fixed list). Prefer the learner's existing topic names when they fit. Every key must appear exactly once. Use "Unsorted" only when nothing fits.`,
    user: (i: ClassifyInput) => `Existing topics: ${json(i.existingTopics)}\nItems:\n${json(i.items)}`,
    check: (i: ClassifyInput, o) => {
      const keys = o.groups.flatMap((g) => g.keys);
      const missing = i.items.filter((it) => !keys.includes(it.key));
      return missing.length ? [`${missing.length} items were not assigned`] : [];
    },
    demo: (i: ClassifyInput) => ({
      groups: proposeGroups(i.items.map((it) => ({ key: it.key, text: `${it.headword} ${it.meaning ?? ""}` }))).map((g) => ({
        topic: g.topic, subtopic: g.subtopic ?? null, keys: g.keys,
      })),
    }),
  } satisfies Feature<ClassifyInput, typeof classifyOutput>,

  evaluate: {
    id: "evaluate", version: "evaluate@1", fast: true, schema: evaluateOutput, effort: "low", maxTokens: 4000,
    system: `${TEACHING_PRINCIPLES}
Task: evaluate one learner answer for the given exercise and objective. Score 0-1 reflects how well the objective was met (1 = fully correct and natural). Judge meaning, grammar, collocation, naturalness and register separately in "issues" with severity "error" (incorrect), "unnatural" (understandable but not idiomatic) or "suggestion" (optional refinement). If the answer is already excellent, say so and leave issues empty. Give a guiding "hintQuestion" instead of a correction when the learner could fix it themselves. "improvedVersion" should stay close to the learner's sentence. List other valid answers in "alternatives". Do not penalise a target word that does not fit the learner's idea if they used a valid alternative.`,
    user: (i: EvaluateInput) => `Exercise (${i.task}): ${i.instructions}\nObjective: ${i.objective}\nTarget words: ${json(i.targetWords)}\n${i.sourceText ? `Source: ${i.sourceText}\n` : ""}${i.referenceAnswers?.length ? `Reference answers (not the only valid ones): ${json(i.referenceAnswers)}\n` : ""}Learner answer:\n"""${i.learnerAnswer}"""`,
    check: (i: EvaluateInput, o) => {
      const problems: string[] = [];
      if (o.score < 0 || o.score > 1) problems.push("score out of range");
      for (const issue of o.issues) {
        if (issue.excerpt && !i.learnerAnswer.toLowerCase().includes(issue.excerpt.toLowerCase().trim())) problems.push(`excerpt not in answer: ${issue.excerpt}`);
      }
      return problems;
    },
    demo: (i: EvaluateInput) => demoEvaluate(i),
  } satisfies Feature<EvaluateInput, typeof evaluateOutput>,

  generate: {
    id: "generate", version: "generate@1", schema: generateOutput, effort: "medium", maxTokens: 8000,
    system: `${TEACHING_PRINCIPLES}
Task: create original practice exercises for the given vocabulary.
- translation: a natural German sentence (prompt) that is best translated with the target word; answer = a natural English translation; acceptableAnswers = other good translations.
- error_correction: an English sentence containing ONE realistic learner error involving vocabulary, collocation, register or grammar (prompt); answer = corrected sentence; explanation names the error.
- transformation: a sentence (prompt) and an instruction in "context" to rewrite it using the target word without changing the meaning; answer = model rewrite.
- context_choice: a short paragraph (prompt) with a gap "_____" and 3-4 plausible options; answer = best option; explanation says why the others fit less well.
- cloze_contexts: several different sentences with the target word gapped as "_____"; answer = the exact missing form.
- sentence_lab: a weak but grammatical sentence (prompt) to improve for precision, concision or register (context names the focus); answer = a model improvement.
Sentences must be natural, correct and relevant to the learner's level and topic.`,
    user: (i: GenerateInput) => `Kind: ${i.kind}\nCount: ${i.count}\nTopic: ${i.topic ?? "any"}\nFocus: ${i.focus ?? "none"}\nVocabulary:\n${json(i.entries)}`,
    demo: (i: GenerateInput) => demoGenerate(i),
  } satisfies Feature<GenerateInput, typeof generateOutput>,

  assess: {
    id: "assess", version: "assess@1", schema: assessOutput, effort: "high", maxTokens: 16000,
    system: `${TEACHING_PRINCIPLES}
Task: assess a piece of writing with a task-specific rubric (a summary is not judged like a comment; analysis needs technique → evidence → effect; mediation needs addressee, purpose and selection).
Rules:
- Assess each dimension separately with quoted evidence from the text. Mark "not_applicable" where a dimension does not fit the task.
- Annotations: quote the exact excerpt; set isError=false for stylistic suggestions. Prioritise: meaning-changing errors, serious grammar, vocabulary misuse, unnatural expressions, structural weaknesses, optional refinements. Group repeated small errors. At most ~15 annotations.
- Do not rewrite the whole text. Explain and invite revision; "question" may ask the learner to find a fix themselves.
- Excellent English does not equal task fulfilment; do not inflate marks to encourage.
- Vocabulary: report target words as correct / incorrect / unnatural / not_used / not_needed (not_needed when it would not fit the argument - do not penalise).
- Estimate (only if requested): an indicative range on the Bavarian 0-15 point scale based on a practice rubric; explain the basis and uncertainty. Never call it official and never promise a mark.`,
    user: (i: AssessInput) => `Section: ${i.section}\nTask type: ${i.taskType}\nTitle: ${i.title}\nInstructions: ${i.instructions}\n${i.sourceText ? `Source text:\n"""${i.sourceText}"""\n` : ""}Target words: ${json(i.targetWords)}\nExpected length: ${i.minWords ?? "?"}-${i.maxWords ?? "?"} words\nRubric note: ${i.rubricNote}\nLearner's recurring patterns so far: ${json(i.previousPatterns)}\nEstimate requested: ${i.wantEstimate}\n\nLearner text:\n"""${i.body}"""`,
    check: (i: AssessInput, o) => {
      const problems: string[] = [];
      const body = i.body.toLowerCase().replace(/\s+/g, " ");
      for (const a of o.annotations) {
        if (!body.includes(a.excerpt.toLowerCase().replace(/\s+/g, " ").trim())) problems.push(`annotation excerpt not in text: ${a.excerpt.slice(0, 40)}`);
      }
      if (o.estimate) {
        const { low, high, best } = o.estimate;
        if (low < 0 || high > 15 || low > high || (best !== null && (best < low || best > high))) problems.push("estimate out of range");
      }
      if (!i.wantEstimate && o.estimate) problems.push("estimate given but not requested");
      return problems;
    },
    demo: (i: AssessInput) => demoAssess(i),
  } satisfies Feature<AssessInput, typeof assessOutput>,

  writingPrompt: {
    id: "writingPrompt", version: "writingPrompt@1", schema: promptOutput, effort: "medium", maxTokens: 6000,
    system: `${TEACHING_PRINCIPLES}
Task: create an original writing task. If a source text is needed (analysis, literary, comparison, mediation), WRITE AN ORIGINAL TEXT yourself (300-700 words for analysis, German for mediation) and set sourceLabel to "Original text written for this exercise (fictional)". Never attribute it to a real author or publication and never reproduce copyrighted material. Instructions must be complete and unambiguous, with operators as used in German upper-secondary English exams (summarise, analyse, assess, comment, discuss, mediate …).`,
    user: (i: PromptInput) => `Section: ${i.section}\nTask type: ${i.taskType}\nTopic: ${i.topic}\nDifficulty: ${i.difficulty}\nTime: ${i.minutes ?? "untimed"} min\nVocabulary to encourage (only where natural): ${json(i.targetWords)}`,
    check: (_i: PromptInput, o) => (o.sourceText && !/fictional|written for this exercise/i.test(o.sourceLabel ?? "") ? ["source text must be labelled as original"] : []),
    demo: () => {
      throw new Error("demo_unsupported");
    },
  } satisfies Feature<PromptInput, typeof promptOutput>,

  mindmap: {
    id: "mindmap", version: "mindmap@1", fast: true, schema: mindmapOutput, effort: "low", maxTokens: 6000,
    system: `${TEACHING_PRINCIPLES}
Task: suggest meaningful, labelled relationships between vocabulary items of one topic (and a few closely related academic expressions). Every link needs a relation type and a short note explaining it (e.g. "mitigate ≠ prevent: reduces, does not stop"). No vague links.`,
    user: (i: MindmapInput) => `Topic: ${i.topic}\nWords:\n${json(i.entries)}`,
    demo: () => ({ links: [] }),
  } satisfies Feature<MindmapInput, typeof mindmapOutput>,

  challenge: {
    id: "challenge", version: "challenge@1", fast: true, schema: challengeOutput, effort: "medium", maxTokens: 3000,
    system: `${TEACHING_PRINCIPLES}
Task: the learner challenges or asks about a feedback comment on their writing. Re-examine the comment honestly. If the learner's argument is valid (dictionary usage, context, an acceptable alternative), revise or withdraw the comment. If the comment stands, explain the principle clearly with an example. For "clarify" requests, keep the decision "upheld" unless the comment was wrong, and explain more simply.`,
    user: (i: ChallengeInput) => `Mode: ${i.mode}\nText excerpt context:\n"""${i.text.slice(0, 4000)}"""\nComment: ${json(i.annotation)}\nLearner says: """${i.argument}"""`,
    demo: () => {
      throw new Error("demo_unsupported");
    },
  } satisfies Feature<ChallengeInput, typeof challengeOutput>,

  ...examinerFeatures,

  // ------------------------------------------------ typed-answer semantic check (learning engine)
  // Asked only after the deterministic check said "wrong"; the client shows the result as AI judgement.
  answerCheck: {
    id: "answerCheck", version: "answerCheck@1", fast: true, schema: answerCheckOutput, effort: "low", maxTokens: 600,
    system: `${TEACHING_PRINCIPLES}
Task: a vocabulary exercise expected a specific word, and the learner typed something else. Decide whether the learner's answer is ALSO acceptable for this exact exercise: a genuine synonym or translation with the same meaning that fits the context, register and grammar of the prompt. Spelling slips of a valid answer are fine. Be strict: a related but different meaning, a wrong word class, or a word that does not fit the sentence is not acceptable. "explanation": one or two short sentences for the learner (in English), saying why it fits or what the difference is.`,
    user: (i: AnswerCheckInput) => `Exercise: ${i.exercise}\nPrompt: ${i.prompt}\n${i.context ? `Context: ${i.context}\n` : ""}Answer language: ${i.answerLanguage === "de" ? "German" : "English"}\nExpected answer(s): ${json(i.expected)}\nTarget word: ${i.targetWord}\nLearner answer: """${i.learnerAnswer}"""`,
    check: (_i: AnswerCheckInput, o) => (o.explanation.trim() ? [] : ["explanation is empty"]),
    // No fake judgement in demo mode: the deterministic verdict stays.
    demo: () => {
      throw new Error("demo_unsupported");
    },
  } satisfies Feature<AnswerCheckInput, typeof answerCheckOutput>,
} as const;

export type FeatureId = keyof typeof features;
export type FeatureInput<F extends FeatureId> = Parameters<(typeof features)[F]["user"]>[0];
export type FeatureOutput<F extends FeatureId> = z.infer<(typeof features)[F]["schema"]>;

// ---------------------------------------------------------------- demo implementations

function demoEnrich(i: EnrichInput): z.infer<typeof enrichOutput> {
  const base = normalizeHeadword(i.headword);
  const family: { form: string; pos: string }[] = [];
  if (/ate$/.test(base)) family.push({ form: base.replace(/ate$/, "ation"), pos: "noun" });
  if (/i[sz]e$/.test(base)) family.push({ form: base.replace(/i[sz]e$/, "isation"), pos: "noun" });
  if (/ent$/.test(base)) family.push({ form: base.replace(/ent$/, "ence"), pos: "noun" });
  return {
    partOfSpeech: i.partOfSpeech ?? (/^to /i.test(i.headword) ? "verb" : null),
    translationDe: i.translationDe ?? null,
    definitionEn: i.definitionEn ?? "",
    cefr: null, register: null, connotation: null, collocations: [], synonyms: [], antonyms: [],
    wordFamily: family, patterns: [], grammarNotes: null, ipa: null, commonMistakes: [], confusables: [], idioms: [], examples: [],
    uncertainty: "Demo mode (no AI provider configured): only rule-based suggestions; word-family forms are guesses to check.",
  };
}

function demoEvaluate(i: EvaluateInput): z.infer<typeof evaluateOutput> {
  const text = i.learnerAnswer.trim();
  const use = i.targetWords.map((w) => {
    const used = !!inflectionPattern(w)?.test(text);
    return { word: w, used, correct: null, natural: null, comment: used ? "Present in your answer (meaning and naturalness not checked in demo mode)." : "Not found in your answer." };
  });
  const issues: z.infer<typeof evaluateOutput>["issues"] = [];
  if (text && !/^[A-Z"'“]/.test(text)) issues.push({ excerpt: text.split(/\s+/)[0], category: "spelling", severity: "error", explanation: "Sentences start with a capital letter.", suggestion: text[0].toUpperCase() + text.slice(1).split(/\s+/)[0].slice(1) });
  if (text && !/[.!?"”]$/.test(text)) issues.push({ excerpt: text.split(/\s+/).slice(-1)[0], category: "spelling", severity: "suggestion", explanation: "End the sentence with a full stop.", suggestion: `${text.split(/\s+/).slice(-1)[0]}.` });
  if (/\b(don't|can't|won't|isn't|it's|doesn't)\b/i.test(text)) {
    const m = /\b(don't|can't|won't|isn't|it's|doesn't)\b/i.exec(text)!;
    issues.push({ excerpt: m[0], category: "register", severity: "suggestion", explanation: "Contractions are informal; avoid them in formal writing.", suggestion: m[0].replace("n't", " not").replace("'s", " is") });
  }
  const allUsed = use.every((u) => u.used);
  return {
    verdict: !text ? "incorrect" : allUsed && wordCount(text) >= 6 ? "acceptable" : "needs_revision",
    score: !text ? 0 : allUsed ? 0.5 : 0.2,
    summary: "Demo check only (no AI provider configured): form checks were run, but meaning, grammar and naturalness were NOT evaluated. Rate yourself honestly against the model below.",
    targetWordUse: use, issues, hintQuestion: allUsed ? "Does your sentence make the meaning of the word unmistakable from context?" : "Can you rephrase so that the target word fits naturally?",
    improvedVersion: null, alternatives: i.referenceAnswers ?? [],
  };
}

function demoGenerate(i: GenerateInput): z.infer<typeof generateOutput> {
  const items = i.entries.slice(0, i.count).flatMap((e) => {
    if (i.kind === "cloze_contexts" && e.example) {
      const re = inflectionPattern(e.headword);
      const m = re?.exec(e.example);
      if (!m) return [];
      return [{ targetWord: e.headword, prompt: e.example.replace(m[0], "_____"), context: e.meaning, options: [], answer: m[0], acceptableAnswers: [], explanation: "From your saved example (demo mode)." }];
    }
    if (i.kind === "translation" && e.meaning) {
      return [{ targetWord: e.headword, prompt: `Übersetze ins Englische: „${e.meaning}“`, context: "Demo mode: word-level prompt only.", options: [], answer: e.headword, acceptableAnswers: [], explanation: "Demo mode cannot generate full German sentences." }];
    }
    return [];
  });
  return { items };
}

function demoAssess(i: AssessInput): z.infer<typeof assessOutput> {
  const words = wordCount(i.body);
  const sentences = i.body.split(/(?<=[.!?])\s+/).filter(Boolean);
  const annotations: z.infer<typeof assessOutput>["annotations"] = [];
  const contraction = /\b\w+n't\b|\b(it's|that's|there's|I'm)\b/i.exec(i.body);
  if (contraction) annotations.push({ id: "a1", excerpt: contraction[0], category: "register", priority: "optional", isError: false, explanation: "Contractions sound informal in formal writing.", suggestion: "Write the full form.", question: null });
  const longest = sentences.reduce((a, s) => (wordCount(s) > wordCount(a) ? s : a), "");
  if (wordCount(longest) > 40) annotations.push({ id: "a2", excerpt: longest.split(/\s+/).slice(0, 8).join(" "), category: "clarity", priority: "structural", isError: false, explanation: `This sentence has ${wordCount(longest)} words. Very long sentences are hard to follow.`, suggestion: "Consider splitting it at a logical connector.", question: "Where could this sentence be divided without losing the connection between ideas?" });
  const freq = new Map<string, number>();
  for (const w of i.body.toLowerCase().match(/\b[a-z]{6,}\b/g) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  const repeated = [...freq.entries()].filter(([, n]) => n >= 4).map(([w]) => w);
  if (repeated[0]) annotations.push({ id: "a3", excerpt: repeated[0], category: "vocabulary", priority: "optional", isError: false, explanation: `“${repeated[0]}” appears ${freq.get(repeated[0])} times.`, suggestion: "Vary the wording where the repetition is not deliberate.", question: null });
  const lengthNote = i.minWords && words < i.minWords ? `Below the expected length (${words} of at least ${i.minWords} words).` : i.maxWords && words > i.maxWords ? `Above the expected length (${words}, max ${i.maxWords}).` : `Length: ${words} words.`;
  return {
    summary: `Demo check only (no AI provider configured). Only surface features were checked; content, argument, grammar and vocabulary were NOT assessed. ${lengthNote}`,
    rubricName: "Demo surface check",
    dimensions: WRITING_DIMENSIONS.map((key) => ({
      key, level: "not_applicable" as const,
      assessment: key === "mechanics" ? "Only basic surface checks were run." : "Not assessed in demo mode.",
      evidence: [], strengths: [], weaknesses: [], improvement: "",
    })),
    annotations,
    strengths: [],
    priorities: [{ rank: 1, focus: "Configure an AI provider for a real assessment", action: "See Settings → AI provider. Meanwhile, proofread with the six-pass checklist in the Editing section." }],
    vocabulary: {
      targetUse: i.targetWords.map((w) => ({ word: w, status: inflectionPattern(w)?.test(i.body) ? "correct" as const : "not_used" as const, comment: inflectionPattern(w)?.test(i.body) ? "Present (correctness not checked in demo mode)." : "Not used." })),
      missedOpportunities: [], simplerBetter: [],
    },
    exercise: { skill: "proofreading", instruction: "Read your text once for each pass: grammar, sentence structure, vocabulary, logic, concision, argument.", items: [] },
    estimate: null,
    errorPatterns: annotations.map((a) => ({ category: a.category, count: 1 })),
  };
}
