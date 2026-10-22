// Deterministic mock provider for tests and offline demos (AI_PROVIDER=mock).
// It builds schema-valid responses from the request's mockContext (quoting the real input so semantic
// validation passes). Results are flagged provider="mock" everywhere in the UI. It is never used silently.
import { AIError, type AIProvider, type ProviderRequest, type ProviderResponse } from "./types";
import { segmentEssay } from "@/lib/text/segment";

export type MockBehavior = "ok" | "malformed_once" | "malformed_always" | "invalid_quote_once" | "api_error" | "timeout" | "refusal";

const g = globalThis as unknown as { __mockBehavior?: MockBehavior; __mockCalls?: number };

export function setMockBehavior(b: MockBehavior) {
  g.__mockBehavior = b;
  g.__mockCalls = 0;
}
function behavior(): MockBehavior {
  return g.__mockBehavior ?? ((process.env.MOCK_AI_BEHAVIOR as MockBehavior) || "ok");
}

type Ctx = Record<string, unknown>;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function sentencesOf(text: string) {
  const s = segmentEssay(text).map((x) => x.text).filter((t) => t.split(" ").length >= 3);
  return s.length ? s : [text.trim().slice(0, 120) || "text"];
}
const short = (s: string) => s.split(" ").slice(0, 8).join(" ");

function assessment(ctx: Ctx) {
  const essay = str(ctx.essayText);
  const dims = (ctx.dimensions as string[]) ?? [];
  const sents = sentencesOf(essay);
  const words = essay.split(/\s+/).length;
  const base = Math.min(11, 7 + Math.floor(words / 120));
  const missing = Boolean(ctx.missingMaterial);
  return {
    task_understanding: "The operator asks for the task named in the prompt; the essay is assessed against the task-type dimensions.",
    dimensions: dims.map((key, i) => ({
      key, low: Math.max(0, base - 1 - (i % 2)), best: base - (i % 2), high: Math.min(15, base + 1),
      rationale: `Mock rationale for ${key}.`,
      evidence: [{ quote: short(sents[i % sents.length]), comment: "Mock evidence." }],
    })),
    strengths: [{ title: "Clear opening", quote: short(sents[0]), why_it_works: "States the topic directly.", dimension: dims.find((d) => d === "structure_cohesion" || d === "task_fulfilment") ?? dims[0] }],
    weaknesses: [
      { title: "Effects stated generally", severity: "major", kind: "conceptual", dimension: dims.find((d) => d === "analytical_depth" || d === "argumentation") ?? dims[0], quotes: [short(sents[Math.min(1, sents.length - 1)])], explanation: "The point is asserted rather than explained.", why_it_matters: "Explanation of effect separates the 9–12 from the 13–15 band.", how_to_fix: "Add how and why the technique affects the reader." },
      { title: "Minor language slips", severity: "minor", kind: "language", dimension: dims.find((d) => d === "grammar_accuracy") ?? dims[dims.length - 1], quotes: [short(sents[sents.length - 1])], explanation: "Small inaccuracies.", why_it_matters: "They distract slightly.", how_to_fix: "Proof-read for articles and prepositions." },
    ],
    action_plan: [
      { priority: 1, action: "For each technique, write one sentence on its specific effect.", skill_key: "analytical_depth", why: "Biggest gain in content." },
      { priority: 2, action: "Integrate short quotations with line references.", skill_key: "evidence_integration", why: "Supports claims." },
      { priority: 3, action: "Check prepositions after verbs.", skill_key: "idiomatic_collocations", why: "Frequent small errors." },
    ],
    overall_comment: "Mock assessment: a solid basis with room for deeper explanation.",
    holistic_check: { low: base - 1, high: base + 1 },
    confidence: missing ? "low" : "medium",
    uncertainty_notes: missing ? ["Task prompt or source text missing."] : [],
    curriculum_references: ["eA writing expectations (official, reported — unverified)"],
    vocabulary_suggestions: [{ term: "underscore", meaning: "to emphasise", why_useful: "Precise analytical verb", example: "The repetition underscores the speaker's urgency." }],
  };
}

function revision(ctx: Ctx) {
  const sentences = (ctx.sentences as { id: string; text: string }[]) ?? [];
  const edits = [];
  if (sentences[0]) edits.push({ target_ids: [sentences[0].id], revised_text: sentences[0].text.replace(/[.!?]?$/, ", which frames the whole argument."), category: "precision", explanation: "Mock: the claim is made more specific.", principle: "Say precisely what something does.", how_to_apply: "Ask: what exactly does this show?", is_new_idea: false, needs_evidence_note: null });
  if (sentences[1]) edits.push({ target_ids: [sentences[1].id], revised_text: `Moreover, ${sentences[1].text.charAt(0).toLowerCase()}${sentences[1].text.slice(1)}`, category: "structure_cohesion", explanation: "Mock: a connector links the ideas.", principle: "Signal the logical relation between sentences.", how_to_apply: "Check each paragraph's transitions.", is_new_idea: false, needs_evidence_note: null });
  if (sentences[2]) edits.push({ target_ids: [sentences[2].id], revised_text: `${sentences[2].text} This suggests a wider concern about society.`, category: "deeper_analysis", explanation: "Mock: adds an interpretation.", principle: "Link observations to significance.", how_to_apply: "End analytical points with 'This suggests…'.", is_new_idea: true, needs_evidence_note: "Only valid if the source text supports a social reading." });
  return { overview: "Mock revision focusing on precision, cohesion and depth.", edits };
}

function learnerUpdate(ctx: Ctx) {
  const text = str(ctx.studentText);
  const sents = sentencesOf(text);
  const known = (ctx.knownPatterns as { id: string; label: string }[]) ?? [];
  const patterns = [];
  const absent: string[] = [];
  const m = text.match(/discuss(?:es|ed|ing)? about/i);
  const knownDiscuss = known.find((k) => /discuss/.test(k.label));
  if (m) patterns.push({ existing_pattern_id: knownDiscuss?.id ?? null, label: "discuss + about (no preposition)", category: "collocation", skill_key: "idiomatic_collocations", example_quote: m[0], correction: "discuss", explanation: "'Discuss' is transitive." });
  else if (knownDiscuss) absent.push(knownDiscuss.id);
  return {
    observations: [
      { skill_key: "analytical_depth", polarity: "weakness", quote: short(sents[Math.min(1, sents.length - 1)]), note: "Effect asserted, not explained.", level_estimate: 9 },
      { skill_key: "paragraph_structure", polarity: "strength", quote: short(sents[0]), note: "Clear topic sentence.", level_estimate: 11 },
      { skill_key: "grammar_variety", polarity: "neutral", quote: short(sents[sents.length - 1]), note: "Mostly accurate.", level_estimate: 10 },
    ],
    error_patterns: patterns,
    checked_absent_pattern_ids: absent,
  };
}

function exerciseGen(ctx: Ctx) {
  const type = str(ctx.type, "sentence_improvement");
  return {
    title: `Mock ${type.replace(/_/g, " ")} exercise`,
    objective: `Practise ${str(ctx.skill, "the target skill")} in new sentences.`,
    instructions: "Answer each item in full sentences.",
    passage: type === "device_analysis" ? "[Practice text written for this exercise] The city never sleeps; its lights burn like a fever that no one wants to cure." : null,
    items: [{ id: "1", prompt: "Rewrite: 'The author uses a metaphor to make it interesting.'" }, { id: "2", prompt: "Write one sentence explaining the effect of a metaphor of your choice." }],
    success_criteria: ["Names a specific effect", "Links the effect to the purpose"],
    model_answer: "By comparing the city's lights to a fever, the writer presents urban life as an illness its inhabitants secretly enjoy.",
    answer_key: [{ item_id: "1", answer: "The metaphor presents X as Y, which makes readers…", explanation: "Specific effect." }, { item_id: "2", answer: "Any sentence with technique → effect → purpose.", explanation: "Effect chain." }],
  };
}

function exerciseEval(ctx: Ctx) {
  const answer = str(ctx.answer);
  const good = answer.trim().length > 60;
  return {
    outcome: good ? "correct" : answer.trim().length > 15 ? "partial" : "incorrect",
    score: good ? 0.9 : answer.trim().length > 15 ? 0.5 : 0.1,
    item_feedback: ((ctx.itemIds as string[]) ?? []).map((id) => ({ item_id: id, verdict: good ? "correct" : "partial", comment: "Mock feedback for this item." })),
    strengths: good ? ["Specific effect named."] : [],
    improvements: good ? [] : ["Explain the effect more specifically."],
    corrected_version: good ? null : "Mock corrected version.",
    follow_up: good ? "Try a transfer exercise on a new text." : "Repeat with a new example tomorrow.",
    observations: answer.trim() ? [{ skill_key: str(ctx.skill, "analytical_depth"), polarity: good ? "strength" : "weakness", quote: answer.trim().split(/\s+/).slice(0, 6).join(" "), note: "Mock observation.", level_estimate: good ? 12 : 8 }] : [],
  };
}

function generate(op: ProviderRequest["operation"], ctx: Ctx): unknown {
  switch (op) {
    case "assessment": return assessment(ctx);
    case "revision": return revision(ctx);
    case "explanation": return { explanation: "Mock explanation of the change.", principle: "Be specific about effect.", examples: [{ before: "It is interesting.", after: "It unsettles the reader.", note: "Specific verb." }], common_mistakes: ["Using vague verbs."], practice: { instruction: "Rewrite each sentence.", items: ["The text is good.", "The author uses imagery."] }, self_check: "What exactly does the reader feel?" };
    case "learner_update": return learnerUpdate(ctx);
    case "exercise_generation": return exerciseGen(ctx);
    case "exercise_evaluation": return exerciseEval(ctx);
    case "progress_review": return { summary: "Mock progress review based on the statistics provided.", improvements: [], concerns: [], comparability_cautions: ["Small sample: trends are not yet reliable."], next_steps: ["Assess another essay.", "Complete one exercise for your top priority.", "Review due vocabulary."] };
    case "vocab_check": {
      const used = str(ctx.sentence).toLowerCase().includes(str(ctx.term).toLowerCase().split(" ")[0]);
      return { outcome: used ? "correct" : "incorrect", used_target: used, natural: used, feedback: used ? "Mock: natural use." : "Mock: the target expression is missing.", corrected_sentence: used ? null : `Mock sentence using ${str(ctx.term)}.` };
    }
    case "teacher_analysis": {
      const comments = str(ctx.comments) || str(ctx.criteria);
      const first = comments.split(/(?<=[.!?])\s+/)[0]?.slice(0, 80) ?? "";
      return { observations: first ? [{ statement: "Mock: teacher emphasises the point quoted.", category: "content", quote: first }] : [], criteria_summary: "Mock summary.", notes: [] };
    }
  }
}

export function createMockProvider(): AIProvider {
  return {
    name: "mock",
    model: "mock",
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      g.__mockCalls = (g.__mockCalls ?? 0) + 1;
      const b = behavior();
      const first = g.__mockCalls === 1 || req.messages.length === 1;
      if (b === "api_error") throw new AIError("api_error", "Mock API failure.");
      if (b === "timeout") throw new AIError("timeout", "Mock timeout.");
      if (b === "refusal") throw new AIError("refusal", "Mock refusal.");
      if (b === "malformed_always" || (b === "malformed_once" && first)) {
        return { text: '{"this is": not valid json', stopReason: "end_turn", model: "mock" };
      }
      const data = generate(req.operation, (req.mockContext ?? {}) as Ctx) as Record<string, unknown>;
      if (b === "invalid_quote_once" && first && req.operation === "assessment") {
        (data.strengths as { quote: string }[])[0].quote = "a sentence the student never wrote";
      }
      return { text: JSON.stringify(data), stopReason: "end_turn", model: "mock", inputTokens: 0, outputTokens: 0 };
    },
  };
}
