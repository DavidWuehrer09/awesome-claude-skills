import "server-only";
import { z } from "zod";
import { DRILL_BANK, type Drill } from "@/domain/examiner/drills";
import { containsQuote, quotedSpans } from "@/domain/examiner/text";
import { type Assessment, assessmentSchema, type Blueprint, labItemSchema, CONFIDENCE, type DocType, type Exam, examSchema, PROFILE_SECTIONS, PROVENANCE } from "@/domain/examiner/model";
import { checkAssessment, checkExam, checkProfileEntry, type MaterialInfo, type Materials } from "@/domain/examiner/checks";
import { TAXONOMY } from "@/domain/examiner/weaknesses";
import { LIBRARY } from "@/domain/writing/library";
import { wordCount } from "@/lib/text";
import type { ImageInput } from "./anthropic";
import type { Feature } from "./features";

/**
 * AI features for My English Examiner. Every output is checked against the
 * honesty rules in src/domain/examiner/checks.ts; a failing output is sent
 * back once with the problems listed and otherwise rejected (nothing saved).
 */

const EXAMINER_PRINCIPLES = `You are an experienced, fair and demanding English teacher at a Bavarian Gymnasium, helping one student prepare for Klausuren and the English Abitur (increased level). You are an AI practice examiner, not the student's teacher.
Honesty rules (mandatory):
- Every claim about the course, the teacher or the marking carries a provenance: teacher_explicit (only with a word-for-word quote from a confirmed teacher document), observed_pattern (seen in the uploaded documents; one document = provisional), official_guidance (only with a URL that is listed as verified), general_principle, ai_suggestion. Never present a pattern or a principle as the teacher's rule.
- Never invent teacher comments, grading rules, point bands, official requirements, authors, publications, dates, URLs or quotations. Text in double quotes must occur word for word in the exam's sources or in the student's answers.
- Marks use only the Bavarian 0–15 point scale, as a range. No percentage-to-points conversion unless the teacher's uploaded rubric provides it. Never promise a mark or claim to reproduce the teacher's judgement.
- Distinguish incorrect English from unnatural, imprecise, or valid-but-less-effective English. Never "correct" what is already excellent.
- Prioritise what costs the most marks. Do not reward verbosity, memorised phrases or obscure vocabulary for its own sake.`;

const json = (v: unknown) => JSON.stringify(v, null, 1);
// Safety net only: documents are budgeted by packDocuments (src/domain/examiner/context.ts) before they get here.
const excerpt = (t: string, n = 200_000) => (t.length > n ? `${t.slice(0, n)}\n[…truncated…]` : t);

/** `text` is the full document (used by the honesty checks); `promptText` is what the AI reads, if shortened. */
export type MaterialForAI = { id: string; filename: string; docType: DocType | null; usable: boolean; text: string; promptText?: string };
const read = (m: MaterialForAI) => excerpt(m.promptText ?? m.text);
const toMap = (ms: MaterialForAI[]): Materials => new Map(ms.map((m) => [m.id, m satisfies MaterialInfo]));

/** Uploaded sources always use the stored document text, never the model's copy. */
export function materializeExam(exam: Exam, materials: Materials): Exam {
  return {
    ...exam,
    sources: exam.sources.map((s) => (s.kind === "uploaded_material" && s.materialId && materials.get(s.materialId) ? { ...s, text: materials.get(s.materialId)!.text, citation: null } : s)),
  };
}

// ---------------------------------------------------------------- transcribe

const transcribeOutput = z.object({ text: z.string(), unreadable: z.array(z.string()), notes: z.array(z.string()) });
type TranscribeInput = { filename: string; images?: ImageInput[]; pdfBase64?: string };

// ---------------------------------------------------------------- profile suggestions

const profileSuggestOutput = z.object({
  entries: z.array(z.object({
    section: z.enum(PROFILE_SECTIONS),
    statement: z.string(),
    provenance: z.enum(PROVENANCE),
    confidence: z.enum(CONFIDENCE),
    evidence: z.array(z.object({ materialId: z.string().nullable(), quote: z.string().nullable(), location: z.string().nullable(), url: z.string().nullable() })),
  })),
  gaps: z.array(z.string()),
});
type ProfileSuggestInput = { materials: MaterialForAI[]; existing: string[] };

// ---------------------------------------------------------------- generate

export type GenerateInput = {
  blueprint: Blueprint;
  profile: { statement: string; provenance: string; confidence: string }[];
  focusSkills: string[];
  vocabulary: string[];
  references: MaterialForAI[];
  sources: MaterialForAI[];
  verifiedGuidance: boolean;
};

// ---------------------------------------------------------------- assess

export type AssessInput = {
  exam: Exam;
  answers: Record<string, string>;
  version: number;
  previous: { version: number; estimate: Assessment["estimate"]; topComments: string[] } | null;
  profile: { statement: string; provenance: string; confidence: string }[];
  rubrics: MaterialForAI[];
  materials: MaterialForAI[];
  unhelpful: { comment: string; reason: string }[];
  /** Shortened exam source texts for the prompt (full texts stay in exam for the checks). */
  promptSources?: Record<string, string>;
};

// ---------------------------------------------------------------- dispute

const disputeOutput = z.object({
  outcome: z.enum(["upheld", "revised", "withdrawn"]),
  response: z.string(),
  revision: z.object({
    problem: z.string(), whyWeakens: z.string(), alternative: z.string().nullable(), whyBetter: z.string().nullable(),
    category: assessmentSchema.shape.comments.element.shape.category, englishStatus: assessmentSchema.shape.comments.element.shape.englishStatus,
    severity: assessmentSchema.shape.comments.element.shape.severity,
  }).nullable(),
});
const explainOutput = z.object({
  explanation: z.string(),
  basis: z.enum(PROVENANCE),
  examples: z.array(z.object({ weaker: z.string(), stronger: z.string() })),
});
type ExplainInput = { comment: Assessment["comments"][number]; answer: string; task: Exam["tasks"][number] | undefined };

// ---------------------------------------------------------------- standalone Improvement Lab and drills

const labOutput = z.object({ items: z.array(labItemSchema), overall: z.string() });
export type LabInput = { text: string; taskType: string | null; context: string | null; focus: string | null };

const drillOutput = z.object({
  drills: z.array(z.object({
    skill: z.string(), kind: z.enum(["rewrite", "short_paragraph", "identify", "plan"]), instruction: z.string(),
    material: z.string().nullable(), modelAnswer: z.string().nullable(), checklist: z.array(z.string()),
  })),
});
export type DrillInput = { skills: { skill: string; label: string; count: number }[]; vocabulary: string[]; examples: Drill[] };

type DisputeInput = { comment: Assessment["comments"][number]; argument: string; answer: string; task: Exam["tasks"][number] | undefined; sources: string };

export const examinerFeatures = {
  examTranscribe: {
    id: "examTranscribe", version: "examTranscribe@1", schema: transcribeOutput, effort: "medium", maxTokens: 16000,
    system: `Transcribe the attached school document exactly. Preserve headings, task numbering, line numbers, tables (as tab-separated rows), handwritten teacher comments (as [[teacher comment: …]]) and corrections ([[inserted: …]] / [[deleted: …]]). Never guess unreadable text: write [unreadable] in place and list it in "unreadable". Do not summarise, translate or correct anything.`,
    user: (i: TranscribeInput) => `File: ${i.filename}. Transcribe it.`,
    images: (i: TranscribeInput) => i.images,
    pdf: (i: TranscribeInput) => i.pdfBase64,
    demo: () => {
      throw new Error("demo_unsupported");
    },
  } satisfies Feature<TranscribeInput, typeof transcribeOutput>,

  examProfileSuggest: {
    id: "examProfileSuggest", version: "examProfileSuggest@1", schema: profileSuggestOutput, effort: "medium", maxTokens: 8000,
    system: `${EXAMINER_PRINCIPLES}
Task: propose entries for the student's course profile from their confirmed documents (exam format, time limit, task types and wording, answer length, source genres, grading criteria, recurring feedback…). Every entry needs evidence: materialId plus a short word-for-word quote. One supporting document = confidence "provisional"; "high" needs three. Only teacher documents (exam papers, rubrics, corrections, task instructions, model answers) can support teacher_explicit, and only for what they literally say. Grading criteria inferred from patterns must say "inferred". List what is missing in "gaps". Do not repeat existing entries.`,
    user: (i: ProfileSuggestInput) => `Existing entries:\n${json(i.existing)}\n\nDocuments:\n${i.materials.map((m) => `### ${m.id} (${m.docType}, ${m.filename})\n${read(m)}`).join("\n\n")}`,
    check: (i: ProfileSuggestInput, o) => {
      const map = toMap(i.materials);
      return o.entries.flatMap((e, n) => checkProfileEntry(e, map).map((p) => `entry ${n + 1}: ${p}`));
    },
    demo: (i: ProfileSuggestInput) => demoProfile(i),
  } satisfies Feature<ProfileSuggestInput, typeof profileSuggestOutput>,

  examGenerate: {
    id: "examGenerate", version: "examGenerate@1", schema: examSchema, effort: "high", maxTokens: 24000,
    system: `${EXAMINER_PRINCIPLES}
Task: create an ORIGINAL practice exam from the blueprint.
- Follow the format of the reference exams (task sequence, operators, word limits, timing) when asked, but never copy their questions or texts.
- Sources: write new texts with kind "fictional_practice" and a label containing "Fictional practice text written for this exam", with citation null. Or use an uploaded document listed under "Available source documents" with kind "uploaded_material", its materialId and text "[uploaded]". Never present a generated text as real or attribute it to a real person or outlet. Do not use kind "authentic".
- Tasks: realistic operators (summarise, outline, analyse, examine, comment, discuss, assess, mediate…) at the requested difficulty, with an expected length.
- Points: only if a teacher document defines them (origin teacher_provided, sourceMaterialIds set); otherwise either no points (origin "none") or an AI scheme with origin "ai_practice" whose label contains "practice". totalPoints must equal the sum of task points.
- hidden.taskExpectations: for EVERY task, the expected content, acceptable alternative interpretations, marking notes and common pitfalls. This is only shown after submission.
- provenance: which reference documents the format follows, which profile statements you used, and every assumption (e.g. "time limit assumed: no teacher information"). In provenance.conflicts, list every point where the old exams' format differs from the verified official guidance in the course profile (e.g. length, time, task types); show both, do not silently pick one.`,
    user: (i: GenerateInput) => `Blueprint:\n${json(i.blueprint)}
Course profile (with provenance):\n${json(i.profile)}
Verified official guidance on record: ${i.verifiedGuidance ? "yes" : "no (label Abitur-level formats as assumptions)"}
Weaknesses to target (if focusWeaknesses): ${json(i.focusSkills)}
Vocabulary to elicit naturally (if includeVocabulary): ${json(i.vocabulary)}
Reference exams (format only):\n${i.references.map((r) => `### ${r.id} (${r.filename})\n${read(r)}`).join("\n\n") || "none"}
Available source documents:\n${i.sources.map((s) => `### ${s.id} (${s.filename})\n${read(s)}`).join("\n\n") || "none"}`,
    check: (i: GenerateInput, o) => {
      const map = toMap([...i.references, ...i.sources]);
      const r = checkExam(materializeExam(o, map), { materials: map, referenceIds: i.references.map((x) => x.id), verifiedGuidance: i.verifiedGuidance });
      const extra = o.sources.some((s) => s.kind === "authentic") ? ["generated exams may not use kind 'authentic'"] : [];
      return [...r.errors, ...extra];
    },
    demo: (i: GenerateInput) => demoExam(i),
  } satisfies Feature<GenerateInput, typeof examSchema>,

  examAssess: {
    id: "examAssess", version: "examAssess@1", schema: assessmentSchema, effort: "high", maxTokens: 32000,
    system: `${EXAMINER_PRINCIPLES}
Task: assess the student's submitted exam like a demanding but fair teacher.
- courseSpecific: judge against the teacher's documents ONLY where they exist (rubricMaterialIds). If none: rubricBasis "none_available" and say what is missing.
- independent: judgement by general advanced-level standards.
- dimensions: only those relevant to each task type (a summary is not judged on argumentation).
- strengths: quote the student's own words.
- comments: each quotes the exact passage ("original", copied from the answer), names the problem, why it weakens the answer, a concrete alternative and why it is better. Classify englishStatus honestly; excellent passages get no correction. Prioritise: content and task fulfilment before minor style. Avoid the kinds of comments the student marked as unhelpful.
- estimate: Bavarian 0–15 range; basis "approximation" unless a teacher rubric with point bands exists; list assumptions, evidence, limiting factors and the most valuable changes.
- lab: 2–5 of the student's own passages with three levels (correct → stronger → high-level), an explanation and a short exercise.
- modelAnswer: a model answer per task that respects the expected content, plus alternative valid interpretations and comparisons with the student's passages.
- weaknessObservations: for each relevant skill in the taxonomy (or "custom:<name>"), whether it was present this time, with comment ids. Report absent skills too when the task tested them.
- vocabUsage: for each target vocabulary item, whether and how naturally it was used.
Taxonomy: ${Object.keys(TAXONOMY).join(", ")}`,
    user: (i: AssessInput) => `Exam (including hidden expectations):\n${json({ ...i.exam, sources: i.exam.sources.map((s) => ({ ...s, text: excerpt(i.promptSources?.[s.id] ?? s.text) })) })}
Course profile:\n${json(i.profile)}
Teacher rubric documents:\n${i.rubrics.map((r) => `### ${r.id} (${r.docType}, ${r.filename})\n${read(r)}`).join("\n\n") || "none"}
Comments the student found unhelpful before:\n${json(i.unhelpful)}
${i.previous ? `This is revision ${i.version}. Previous version ${i.previous.version}: estimate ${i.previous.estimate.low}–${i.previous.estimate.high}; main points: ${json(i.previous.topComments)}. Say what improved.\n` : ""}
Student's answers (version ${i.version}):\n${Object.entries(i.answers).map(([t, a]) => `--- Task ${t} (${wordCount(a)} words)\n${a || "[no answer]"}`).join("\n\n")}`,
    check: (i: AssessInput, o) => checkAssessment(o, { exam: i.exam, answers: i.answers, materials: toMap(i.materials) }).errors,
    demo: (i: AssessInput) => demoAssessment(i),
  } satisfies Feature<AssessInput, typeof assessmentSchema>,

  examLab: {
    id: "examLab", version: "examLab@1", schema: labOutput, effort: "medium", maxTokens: 10000,
    system: `${EXAMINER_PRINCIPLES}
Task: the 15-Point Improvement Lab. Choose the 2–5 passages of the student's text where improvement matters most (or the passage they ask about). For each: quote it exactly ("original"), then level 1 = correct and clear, level 2 = stronger and more precise, level 3 = high-level (only if it stays natural; otherwise null). Explain what makes each level effective, the nuance, which of reasoning/structure/analysis/language it improves, why it fits this context, and any risk (e.g. sounding forced). Add a short exercise to practise the same move. Keep the student's meaning; do not invent facts about a source. "task" is "lab". In "overall", give one or two sentences on the most valuable improvement.`,
    user: (i: LabInput) => `${i.taskType ? `Task type: ${i.taskType}\n` : ""}${i.focus ? `Focus requested: ${i.focus}\n` : ""}${i.context ? `Context/source (for checking content):\n"""${excerpt(i.context, 40_000)}"""\n` : ""}Student's text:\n"""${i.text}"""`,
    check: (i: LabInput, o) => o.items.flatMap((item, n) => [
      ...(containsQuote(i.text, item.original) ? [] : [`item ${n + 1}: "original" is not in the student's text`]),
      ...[item.level1Correct, item.level2Stronger, item.level3HighLevel].flatMap((t) => quotedSpans(t).filter((q) => !containsQuote(`${i.text}\n${i.context ?? ""}`, q)).map((q) => `item ${n + 1}: quotation not in the texts: "${q.slice(0, 50)}"`)),
    ]),
    demo: () => ({ items: [], overall: "Demo mode cannot rewrite your text. With an AI provider configured, the lab shows each chosen passage at three levels with explanations and an exercise." }),
  } satisfies Feature<LabInput, typeof labOutput>,

  examDrills: {
    id: "examDrills", version: "examDrills@1", schema: drillOutput, effort: "low", maxTokens: 6000,
    system: `${EXAMINER_PRINCIPLES}
Task: write short, original practice drills for the student's recurring weaknesses (the requested number per skill). Kinds: rewrite (improve given material), short_paragraph (write 3–6 sentences), identify (find the problem), plan (plan an answer). Each drill has a clear instruction, its own short material (fictional; never attributed to a real author), a model answer where one exists, and a 2–4 point self-check list. Use the given vocabulary where it fits naturally. The examples show the expected style; do not copy them.`,
    user: (i: DrillInput) => `Skills: ${json(i.skills)}\nVocabulary: ${json(i.vocabulary)}\nExamples:\n${json(i.examples.slice(0, 3))}`,
    demo: (i: DrillInput) => ({ drills: i.skills.map((s) => DRILL_BANK[s.skill]).filter((d): d is Drill => !!d) }),
  } satisfies Feature<DrillInput, typeof drillOutput>,

  examExplain: {
    id: "examExplain", version: "examExplain@1", schema: explainOutput, effort: "low", maxTokens: 3000, fast: true,
    system: `${EXAMINER_PRINCIPLES}
Task: the student asks why a passage was marked. Explain the reasoning in plain, encouraging language (3–6 sentences): what the reader experiences, which convention or expectation is involved, and why the alternative works better here. Say honestly where the comment's basis comes from (teacher document, observed pattern, general principle or suggestion). Give 1–2 short general examples (not copied from the student's text) of weaker vs stronger phrasing.`,
    user: (i: ExplainInput) => `Task: ${i.task ? `${i.task.number} (${i.task.type}) ${i.task.instruction}` : "unknown"}
Comment:\n${json(i.comment)}
Student's answer to this task:\n"""${i.answer}"""`,
    demo: (i: ExplainInput) => ({
      explanation: `Demo mode cannot explain beyond the stored comment. The comment says: ${i.comment.problem} ${i.comment.whyWeakens}${i.comment.whyBetter ? ` The suggested alternative is better because: ${i.comment.whyBetter}` : ""}`,
      basis: i.comment.provenance,
      examples: [],
    }),
  } satisfies Feature<ExplainInput, typeof explainOutput>,

  examDispute: {
    id: "examDispute", version: "examDispute@1", schema: disputeOutput, effort: "medium", maxTokens: 4000,
    system: `${EXAMINER_PRINCIPLES}
Task: the student disputes one comment from your assessment. Reconsider it honestly. If their argument is valid, revise or withdraw the comment; do not defend it for consistency's sake. If the comment stands, explain why respectfully and concretely. For "revised", give the full revised comment fields; otherwise revision is null.`,
    user: (i: DisputeInput) => `Task: ${i.task ? `${i.task.number} (${i.task.type}) ${i.task.instruction}` : "unknown"}
Comment:\n${json(i.comment)}
Student's argument:\n"""${i.argument}"""
Student's full answer to this task:\n"""${i.answer}"""
Sources:\n${excerpt(i.sources, 60_000)}`,
    demo: () => {
      throw new Error("demo_unsupported");
    },
  } satisfies Feature<DisputeInput, typeof disputeOutput>,
} as const;

// ---------------------------------------------------------------- demo implementations

function demoProfile(i: ProfileSuggestInput): z.infer<typeof profileSuggestOutput> {
  const entries: z.infer<typeof profileSuggestOutput>["entries"] = [];
  const exams = i.materials.filter((m) => m.docType === "exam_paper" || m.docType === "task_instruction");
  const pattern = (section: (typeof PROFILE_SECTIONS)[number], re: RegExp, statement: (m: RegExpMatchArray) => string) => {
    const hits = exams.map((m) => ({ m, match: m.text.match(re) })).filter((h): h is { m: MaterialForAI; match: RegExpMatchArray } => !!h.match);
    if (!hits.length) return;
    const docs = new Set(hits.map((h) => h.m.id)).size;
    entries.push({
      section, statement: statement(hits[0].match), provenance: "observed_pattern",
      confidence: docs >= 3 ? "medium" : docs === 2 ? "low" : "provisional",
      evidence: hits.map((h) => ({ materialId: h.m.id, quote: h.match[0].trim(), location: null, url: null })),
    });
  };
  pattern("time_limit", /(\d{2,3})\s*(minutes|min\b|minuten)/i, (m) => `Time allowed in your exams: ${m[1]} minutes (observed).`);
  pattern("answer_length", /(in )?about\s+(\d{2,4})\s+words/i, (m) => `Tasks ask for about ${m[2]} words (observed).`);
  pattern("task_wording", /\b(summari[sz]e|outline|analy[sz]e|examine|comment on|discuss|assess|mediate)\b/i, (m) => `Task wording uses operators such as “${m[1]}” (observed).`);
  return {
    entries: entries.filter((e) => !i.existing.includes(e.statement)),
    gaps: ["Demo mode: only time limits, word counts and operators were detected by simple rules. Grading criteria, feedback patterns and source genres need a real AI provider or your own entries."],
  };
}

function demoExam(i: GenerateInput): Exam {
  const bp = i.blueprint;
  const uploaded = i.sources[0];
  const lib = LIBRARY.filter((l) => l.sourceText && l.section === "abitur");
  const pick = lib.find((l) => bp.topics.some((t) => l.topic.toLowerCase().includes(t.toLowerCase()))) ?? lib[0];
  const source = uploaded
    ? { id: "S1", title: uploaded.filename, kind: "uploaded_material" as const, label: "From your uploaded materials", materialId: uploaded.id, lineNumbered: true, text: uploaded.text, citation: null }
    : { id: "S1", title: pick.title.replace(/^[^:]+:\s*/, "").replace(/^\w/, (c) => c.toUpperCase()), kind: "fictional_practice" as const, label: "Fictional practice text written for this app", materialId: null, lineNumbered: true, text: pick.sourceText!, citation: null };
  const words = bp.targetWords ?? 300;
  const all = [
    { type: "summary" as const, operator: "Summarise", instruction: `Summarise the main ideas of the text (S1) in about ${Math.round(words / 2.5)} words.`, len: Math.round(words / 2.5), exp: ["The central situation or claim of the text", "The key supporting points in the order of importance", "Neutral tone, own words, no personal opinion"] },
    { type: "non_fiction_analysis" as const, operator: "Analyse", instruction: "Analyse how the text tries to influence its readers or listeners. Focus on structure and language, and refer to the text with line numbers.", len: words, exp: ["The purpose and intended effect on the audience", "Structural choices and how they guide the reader", "Language devices WITH their effect, supported by quotations and line numbers"] },
    { type: "comment" as const, operator: "Comment on", instruction: `“${bp.topics[0] ?? pick.topic} is a matter for individuals, not for the state.” Comment on this statement, referring to the text where relevant.`, len: words, exp: ["A clear position", "Developed arguments with examples", "A genuine counterargument and a reasoned rebuttal", "A conclusion that follows from the argument"] },
    { type: "mediation" as const, operator: "Mediate", instruction: "A friend from abroad asks what the text is about. Write an e-mail explaining its main points for them.", len: Math.round(words / 1.5), exp: ["Selection of the information relevant to the addressee", "Adequate register for an e-mail to a friend", "No word-for-word translation"] },
  ];
  const chosen = all.slice(0, bp.taskCount);
  const per = Math.floor(bp.durationMinutes / chosen.length);
  return {
    title: `Practice ${bp.examType}: ${bp.topics[0] ?? pick.topic}`,
    topic: bp.topics[0] ?? pick.topic,
    examType: bp.examType,
    difficulty: bp.difficulty,
    durationMinutes: bp.durationMinutes,
    permittedResources: ["Monolingual dictionary (if your school allows it)"],
    generalInstructions: "Demo exam assembled from built-in practice material. Answer all tasks in English.",
    sources: [source],
    tasks: chosen.map((t, n) => ({
      number: String(n + 1), type: t.type, operator: t.operator, instruction: t.instruction, sourceIds: ["S1"],
      expectedLength: { min: Math.round(t.len * 0.85), max: Math.round(t.len * 1.15), unit: "words" as const }, suggestedMinutes: per, points: null,
    })),
    marking: { origin: "none", label: "No points scheme (demo)", totalPoints: null, sourceMaterialIds: [], criteria: [] },
    hidden: {
      taskExpectations: chosen.map((t, n) => ({ task: String(n + 1), expectedContent: t.exp, acceptableAlternatives: ["Other well-supported readings of the text are acceptable."], markingNotes: "Demo expectations: general, not specific to your teacher.", commonPitfalls: ["Retelling instead of analysing", "Missing evidence from the text"] })),
      vocabularyTargets: bp.includeVocabulary ? i.vocabulary.slice(0, 8) : [],
      weaknessTargets: bp.focusWeaknesses ? i.focusSkills.slice(0, 3) : [],
    },
    provenance: {
      formatBasedOn: [],
      profileEntriesUsed: [],
      notes: "Demo mode: a fixed task pattern with a built-in fictional text. No reference exam or course profile was analysed.",
      assumptions: ["Task sequence, word counts and timing are generic assumptions, not your teacher's format."],
      conflicts: [],
    },
  };
}

function demoAssessment(i: AssessInput): Assessment {
  const comments: Assessment["comments"] = [];
  const observations: Assessment["weaknessObservations"] = [];
  const plan: Assessment["improvementPlan"] = [];
  let lengthIssues = 0;
  const contractions: string[] = [];
  for (const t of i.exam.tasks) {
    const answer = i.answers[t.number] ?? "";
    const wc = wordCount(answer);
    const len = t.expectedLength;
    if (len?.unit === "words" && answer.trim() && ((len.min != null && wc < len.min * 0.8) || (len.max != null && wc > len.max * 1.2))) lengthIssues++;
    const m = answer.match(/\b(?:\w+n't|I'm|it's|that's|they're|we're|you're|I've|can't|won't)\b/i);
    if (m && comments.length < 5) {
      const id = `c${comments.length + 1}`;
      contractions.push(id);
      const full = m[0].replace(/n't$/i, " not").replace(/'m$/i, " am").replace(/'s$/i, " is").replace(/'re$/i, " are").replace(/'ve$/i, " have").replace(/^can not$/i, "cannot").replace(/^wo not$/i, "will not");
      comments.push({
        id, task: t.number, original: m[0], problem: "Contraction in a formal exam text.", whyWeakens: "Contractions make academic writing sound conversational.",
        alternative: full, whyBetter: "The full form matches the formal register expected in exam writing.", category: "style",
        englishStatus: "valid_less_effective", severity: "minor", provenance: "general_principle", dimension: "register",
      });
    }
  }
  observations.push({ skill: "word_count_control", present: lengthIssues > 0, severity: lengthIssues ? "moderate" : "none", commentIds: [], note: "Checked mechanically against the expected length." });
  observations.push({ skill: "register_slips", present: contractions.length > 0, severity: contractions.length ? "minor" : "none", commentIds: contractions, note: "Only contractions were checked (demo)." });
  if (lengthIssues) plan.push({ priority: 1, focus: "Length control", action: "Plan paragraphs to the expected word count before writing; check the count before submitting.", skill: "word_count_control" });
  plan.push({ priority: plan.length + 1, focus: "Get a real assessment", action: "Configure an AI provider (ANTHROPIC_API_KEY) to receive content, argument and language feedback on this exam.", skill: null });
  const firstSentence = (() => {
    for (const t of i.exam.tasks) {
      const s = (i.answers[t.number] ?? "").split(/(?<=[.!?])\s+/).find((x) => wordCount(x) >= 5);
      if (s) return { task: t.number, original: s.trim() };
    }
    return null;
  })();
  return {
    courseSpecific: {
      rubricBasis: "none_available", rubricMaterialIds: [], summary: "Demo mode: your teacher's criteria were not applied.",
      appliedCriteria: [], insufficientEvidenceNotes: ["Demo mode does not evaluate content, argument or language. Upload your teacher's rubric and configure an AI provider for a course-specific view."],
    },
    independent: { summary: "Demo mode: only mechanical checks (length, contractions) were run. This is not an evaluation of your exam.", standardsNote: "" },
    dimensions: [{ key: "mechanics", task: null, applicable: true, level: contractions.length || lengthIssues ? "adequate" : "solid", comment: "Demo: based only on word counts and contractions." }],
    strengths: firstSentence ? [{ ...firstSentence, whyStrong: "You produced a complete sentence of your own; demo mode cannot judge its quality." }] : [],
    comments,
    estimate: {
      low: 0, high: 15, best: null, basis: "approximation",
      assumptions: ["Demo mode: no AI evaluated your answers, so the range is deliberately the whole scale."],
      evidence: ["Word counts and contractions only."],
      limitingFactors: ["No real assessment was performed."],
      mostValuableChanges: plan.map((p) => p.action),
    },
    improvementPlan: plan,
    lab: [],
    modelAnswer: {
      perTask: i.exam.tasks.map((t) => ({ task: t.number, text: "Demo mode cannot write a model answer. The expected content for this task is listed in the report under What was expected.", whyEffective: [] })),
      alternativeInterpretations: [],
      comparisons: [],
    },
    weaknessObservations: observations,
    vocabUsage: i.exam.hidden.vocabularyTargets.map((term) => {
      const used = Object.values(i.answers).some((a) => a.toLowerCase().includes(term.toLowerCase().replace(/^to /, "")));
      return { term, used, natural: null, comment: used ? "Found in your text (naturalness not judged in demo mode)." : "Not used." };
    }),
  };
}
