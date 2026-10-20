/**
 * Mechanical honesty rules. Profile entries, generated exams and assessments
 * are rejected (or re-requested from the AI) when they break them, so an
 * inferred pattern can never quietly become a "teacher rule" and a quotation
 * can never be invented.
 */
import { wordCount } from "@/lib/text";
import {
  type Assessment, type Confidence, type DocType, type Exam, type Provenance, type ProfileSection, TEACHER_DOC_TYPES,
} from "./model";
import { containsQuote, quotedSpans, sentences, shingles, similarity } from "./text";
import { TAXONOMY } from "./weaknesses";

export type MaterialInfo = { id: string; docType: DocType | null; usable: boolean; text: string; filename: string };
export type Materials = Map<string, MaterialInfo>;

// ---------------------------------------------------------------- profile

export type ProfileEntryInput = {
  section: ProfileSection;
  statement: string;
  provenance: Provenance;
  confidence: Confidence;
  evidence: { materialId?: string | null; quote?: string | null; location?: string | null; url?: string | null }[];
};

export function checkProfileEntry(e: ProfileEntryInput, materials: Materials): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  e.evidence.forEach((ev, i) => {
    if (ev.url && !ev.materialId) return;
    const m = ev.materialId ? materials.get(ev.materialId) : undefined;
    if (!m) {
      errs.push(`Evidence ${i + 1}: the document does not exist (any more).`);
      return;
    }
    ids.add(m.id);
    if (!m.docType) errs.push(`Evidence ${i + 1}: confirm what “${m.filename}” is before using it as evidence.`);
    if (ev.quote && !containsQuote(m.text, ev.quote)) errs.push(`Evidence ${i + 1}: the quote was not found in “${m.filename}”.`);
    if (e.provenance === "teacher_explicit" && m.docType && !TEACHER_DOC_TYPES.has(m.docType)) {
      errs.push(`Evidence ${i + 1}: a ${m.docType.replace("_", " ")} cannot prove an explicit teacher requirement.`);
    }
  });
  switch (e.provenance) {
    case "teacher_explicit":
      if (!e.evidence.some((ev) => ev.quote && ev.materialId)) errs.push("A teacher requirement needs a word-for-word quote from a teacher document.");
      break;
    case "observed_pattern":
      if (!ids.size) errs.push("A pattern needs evidence from your uploaded materials.");
      else if (ids.size < 2 && e.confidence !== "provisional") errs.push("A pattern seen in only one document must be marked provisional.");
      else if (ids.size < 3 && (e.confidence === "high" || e.confidence === "confirmed")) errs.push("High confidence for a pattern needs at least three documents.");
      if (e.confidence === "confirmed") errs.push("A pattern is never “confirmed”; only the teacher's own requirements are.");
      break;
    case "official_guidance":
      if (!e.evidence.some((ev) => ev.url)) errs.push("Official guidance needs the address (URL) of the document.");
      break;
    default:
      if (e.confidence === "confirmed") errs.push("General principles and AI suggestions cannot be “confirmed”.");
  }
  if (e.section === "grading_criteria" && (e.provenance === "observed_pattern" || e.provenance === "ai_suggestion")
    && !/inferred|suggest/i.test(e.statement)) {
    errs.push("Grading criteria from patterns or suggestions must say “inferred” or “suggested”.");
  }
  return errs;
}

// ---------------------------------------------------------------- exam

export type ExamCheckContext = {
  materials: Materials;
  referenceIds: string[];
  verifiedGuidance: boolean;
};

export type Originality = { task?: string; source?: string; materialId: string; similarity: number; generated?: string };

/**
 * Reusing the *format* of a reference exam (operator, word limit, sequence) is
 * intended; reusing the *content* of an old question or text is not.
 */
export function originality(exam: Exam, refs: { id: string; text: string }[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Originality[] = [];
  if (!refs.length) return { errors, warnings, details };
  const refSentences = refs.flatMap((r) => sentences(r.text).map((s) => ({ id: r.id, s })));
  for (const task of exam.tasks) {
    for (const sent of sentences(task.instruction)) {
      let best = { r: 0, id: "" };
      for (const ref of refSentences) {
        const r = similarity(sent, ref.s);
        if (r > best.r) best = { r, id: ref.id };
      }
      if (best.r >= 0.75) {
        details.push({ task: task.number, materialId: best.id, similarity: Math.round(best.r * 100) / 100, generated: sent });
        (best.r >= 0.9 && wordCount(sent) >= 12 ? errors : warnings).push(`Task ${task.number} is ${Math.round(best.r * 100)} % similar to a sentence in a reference exam.`);
      }
    }
  }
  const refShingles = refs.map((r) => ({ id: r.id, sh: shingles(r.text) }));
  for (const src of exam.sources) {
    if (src.kind === "uploaded_material") continue;
    const sh = shingles(src.text);
    if (!sh.size) continue;
    for (const ref of refShingles) {
      let shared = 0;
      for (const s of sh) if (ref.sh.has(s)) shared++;
      const overlap = shared / sh.size;
      if (overlap >= 0.05) {
        details.push({ source: src.id, materialId: ref.id, similarity: Math.round(overlap * 1000) / 1000 });
        (overlap >= 0.15 ? errors : warnings).push(`Source “${src.title}” repeats ${Math.round(overlap * 100)} % of its wording from a reference exam.`);
      }
    }
  }
  return { errors, warnings, details };
}

export function checkExam(exam: Exam, c: ExamCheckContext) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const srcIds = new Set(exam.sources.map((s) => s.id));
  if (srcIds.size !== exam.sources.length) errors.push("Duplicate source ids.");
  if (exam.durationMinutes < 10 || exam.durationMinutes > 330) errors.push("Duration must be 10–330 minutes.");
  if (!exam.tasks.length) errors.push("An exam needs at least one task.");
  for (const s of exam.sources) {
    if (!s.text.trim()) errors.push(`Source ${s.id} is empty.`);
    if (s.kind === "fictional_practice") {
      if (!/fictional/i.test(s.label)) errors.push(`Source ${s.id}: a generated text must be labelled as fictional.`);
      if (s.citation && (s.citation.author || s.citation.publication || s.citation.url)) errors.push(`Source ${s.id}: a fictional text must not carry publication details.`);
    } else if (s.kind === "authentic") {
      const ci = s.citation;
      if (!ci || !ci.author || !ci.title || !ci.publication || !ci.date) errors.push(`Source ${s.id}: an authentic source needs author, title, publication and date.`);
      if (!ci?.verified) errors.push(`Source ${s.id}: an authentic source must be verified; otherwise use a fictional practice text.`);
    } else {
      const m = s.materialId ? c.materials.get(s.materialId) : undefined;
      if (!m) errors.push(`Source ${s.id}: uploaded document not found.`);
      else if (!m.usable) errors.push(`Source ${s.id}: “${m.filename}” must be confirmed and reviewed first.`);
    }
  }
  const numbers = exam.tasks.map((t) => t.number);
  if (new Set(numbers).size !== numbers.length) errors.push("Task numbers must be unique.");
  for (const t of exam.tasks) {
    if (wordCount(t.instruction) < 3) errors.push(`Task ${t.number}: the instruction is too short.`);
    for (const sid of t.sourceIds) if (!srcIds.has(sid)) errors.push(`Task ${t.number}: unknown source ${sid}.`);
  }
  const pointed = exam.tasks.filter((t) => t.points != null);
  const m = exam.marking;
  if (pointed.length) {
    if (pointed.length !== exam.tasks.length) errors.push("Either every task has points or none does.");
    const sum = pointed.reduce((n, t) => n + (t.points ?? 0), 0);
    if (m.totalPoints !== sum) errors.push("Total points must equal the sum of the task points.");
    if (m.origin === "ai_practice" && !/practice/i.test(m.label)) errors.push("An AI-made marking scheme must be labelled as a practice scheme.");
    if ((m.origin === "teacher_provided" || m.origin === "official") && !m.sourceMaterialIds.length) errors.push("A teacher/official marking scheme must name the document it comes from.");
    for (const id of m.sourceMaterialIds) if (!c.materials.get(id)?.usable) errors.push("The marking scheme cites a document that is not confirmed and reviewed.");
  } else if (m.totalPoints != null) {
    errors.push("Total points are given but the tasks have no points.");
  }
  const minutes = exam.tasks.reduce((n, t) => n + (t.suggestedMinutes ?? 0), 0);
  if (minutes > exam.durationMinutes) warnings.push(`Suggested times add up to ${minutes} min, more than the ${exam.durationMinutes} min limit.`);
  const hidden = new Set(exam.hidden.taskExpectations.filter((h) => h.expectedContent.length).map((h) => h.task));
  for (const n of numbers) if (!hidden.has(n)) errors.push(`Task ${n}: expectations for grading are missing.`);
  if (exam.difficulty === "abitur" && !c.verifiedGuidance) {
    warnings.push("Abitur level without verified official guidance in your course profile: the format is based on general assumptions.");
  }
  const refs = [...new Set([...c.referenceIds, ...exam.provenance.formatBasedOn])]
    .map((id) => c.materials.get(id)).filter((x): x is MaterialInfo => !!x).map((x) => ({ id: x.id, text: x.text }));
  const orig = originality(exam, refs);
  return { errors: [...errors, ...orig.errors], warnings: [...warnings, ...orig.warnings], originality: orig.details };
}

// ---------------------------------------------------------------- assessment

const NOT_TYPICAL: Record<string, string[]> = { summary: ["argumentation", "source_analysis"], reading_comprehension: ["argumentation"], mediation: ["source_analysis"] };

const OVERCLAIM = [
  /\bguarantee[sd]?\b/i,
  /\bwill (definitely|certainly|surely) (get|receive|score|earn)\b/i,
  /\byour teacher (would|will) (definitely |certainly )?(give|award|mark)\b/i,
  /\bthis is (an|your) official (grade|mark|result)\b/i,
  /\bexactly (as|what) your teacher\b/i,
];
const PERCENT = /\d{1,3}\s*(%|percent|prozent)/i;

function* strings(v: unknown): Generator<string> {
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x);
  else if (v && typeof v === "object") for (const x of Object.values(v)) yield* strings(x);
}

export type AssessmentCheckContext = { exam: Exam; answers: Record<string, string>; materials: Materials };

export function checkAssessment(a: Assessment, c: AssessmentCheckContext) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceText = c.exam.sources.map((s) => s.text).join("\n\n");
  const types = new Map(c.exam.tasks.map((t) => [t.number, t.type]));

  const inAnswer = (task: string, text: string, where: string) => {
    if (!(task in c.answers)) errors.push(`${where}: unknown task ${task}.`);
    else if (!containsQuote(c.answers[task], text)) errors.push(`${where}: passage not found in your answer to task ${task}: “${text.slice(0, 70)}”.`);
  };
  const quotesExist = (text: string | null, where: string) => {
    for (const q of quotedSpans(text)) {
      if (!containsQuote(sourceText, q) && !Object.values(c.answers).some((ans) => containsQuote(ans, q))) {
        errors.push(`${where}: quotation not found in the exam's sources: “${q.slice(0, 70)}”.`);
      }
    }
  };

  const ids = a.comments.map((x) => x.id);
  if (new Set(ids).size !== ids.length) errors.push("Comment ids must be unique.");
  const sev = { major: 0, moderate: 0, minor: 0, none: 0 };
  for (const cm of a.comments) {
    const where = `Comment ${cm.id}`;
    inAnswer(cm.task, cm.original, where);
    sev[cm.severity]++;
    if (cm.englishStatus === "excellent") {
      if (cm.alternative) errors.push(`${where}: an excellent passage must not get a “correction”.`);
      if (cm.severity !== "none") errors.push(`${where}: excellent passages have severity “none”.`);
    } else if (!cm.alternative || !cm.whyBetter) {
      errors.push(`${where}: criticism needs an alternative and an explanation why it is better.`);
    }
    if (cm.category === "language_error" && cm.englishStatus !== "incorrect") errors.push(`${where}: “language error” is only for incorrect English.`);
    if (cm.englishStatus === "incorrect" && cm.category === "optional_refinement") errors.push(`${where}: incorrect English cannot be an optional refinement.`);
    if (cm.englishStatus === "valid_less_effective" && cm.severity === "major") errors.push(`${where}: a valid stylistic choice cannot be a major error.`);
    quotesExist(cm.alternative, `${where} (alternative)`);
    quotesExist(cm.whyBetter, `${where} (explanation)`);
  }
  if (sev.minor > 15 && sev.minor > 3 * (sev.major + sev.moderate)) warnings.push("Many minor comments compared with major ones: prioritise what affects the mark most.");
  for (const s of a.strengths) inAnswer(s.task, s.original, "Strength");

  const keys = a.dimensions.map((d) => `${d.key}:${d.task ?? ""}`);
  if (new Set(keys).size !== keys.length) errors.push("Dimension entries must be unique.");
  if (!a.dimensions.some((d) => d.applicable)) errors.push("At least one dimension must be assessed.");
  for (const d of a.dimensions) {
    if (d.applicable && d.level === "not_assessed") errors.push(`Dimension ${d.key}: applicable but not assessed.`);
    const t = d.task ? types.get(d.task) : undefined;
    if (d.applicable && t && NOT_TYPICAL[t]?.includes(d.key)) warnings.push(`Dimension ${d.key} is unusual for a ${t.replace(/_/g, " ")} task.`);
  }

  const cs = a.courseSpecific;
  for (const id of cs.rubricMaterialIds) {
    const m = c.materials.get(id);
    if (!m?.usable || !m.docType || !TEACHER_DOC_TYPES.has(m.docType)) errors.push("Course-specific view cites a document that is not a confirmed teacher document.");
  }
  if (cs.rubricBasis !== "none_available" && !cs.rubricMaterialIds.length) errors.push("A teacher rubric basis must name the rubric document.");
  if (cs.rubricBasis === "none_available" && !cs.insufficientEvidenceNotes.length) errors.push("Say what is missing when no teacher rubric is available.");
  for (const cr of cs.appliedCriteria) {
    if (cr.provenance === "teacher_explicit" && cs.rubricBasis === "none_available") errors.push(`Criterion “${cr.criterion.slice(0, 40)}” is labelled as the teacher's, but no teacher rubric exists.`);
  }

  const est = a.estimate;
  for (const v of [est.low, est.high, est.best]) if (v != null && (!Number.isInteger(v) || v < 0 || v > 15)) errors.push("Estimate values must be whole points from 0 to 15.");
  if (est.low > est.high) errors.push("Estimate: low is above high.");
  if (est.best != null && (est.best < est.low || est.best > est.high)) errors.push("Estimate: the best guess must lie inside the range.");
  if (est.high - est.low >= 4 && est.best != null) warnings.push("A wide range with a single best guess may overstate precision.");
  if (est.basis === "approximation" && !est.assumptions.length) errors.push("An approximate estimate must list its assumptions.");
  if (est.basis !== "approximation" && cs.rubricBasis === "none_available") errors.push("The estimate cannot claim a teacher basis without a teacher rubric.");
  if (!est.evidence.length) errors.push("The estimate must name its evidence.");
  if (!est.limitingFactors.length || !est.mostValuableChanges.length) errors.push("Name the limiting factors and the most valuable changes.");
  if (est.basis !== "teacher_rubric" && [...strings(est)].some((s) => PERCENT.test(s) && /points?|punkte?/i.test(s))) {
    errors.push("Percentage-to-points conversion is only allowed when your teacher's rubric provides it.");
  }

  a.lab.forEach((item, i) => {
    inAnswer(item.task, item.original, `Lab ${i + 1}`);
    quotesExist(item.level1Correct, `Lab ${i + 1}`);
    quotesExist(item.level2Stronger, `Lab ${i + 1}`);
    quotesExist(item.level3HighLevel, `Lab ${i + 1}`);
  });
  if (!a.modelAnswer.perTask.length) errors.push("A model answer is required.");
  for (const p of a.modelAnswer.perTask) {
    if (!types.has(p.task)) errors.push(`Model answer: unknown task ${p.task}.`);
    quotesExist(p.text, `Model answer ${p.task}`);
  }
  for (const cmp of a.modelAnswer.comparisons) inAnswer(cmp.task, cmp.student, "Comparison");
  if (!a.improvementPlan.length) errors.push("An improvement plan is required.");

  for (const w of a.weaknessObservations) {
    if (!(w.skill in TAXONOMY) && !w.skill.startsWith("custom:")) errors.push(`Unknown skill “${w.skill}” (use the taxonomy or the prefix custom:).`);
    for (const id of w.commentIds) if (!ids.includes(id)) errors.push(`Skill ${w.skill}: unknown comment ${id}.`);
  }
  for (const s of strings(a)) {
    if (OVERCLAIM.some((re) => re.test(s))) {
      errors.push(`Over-claim not allowed: “${s.slice(0, 90)}”.`);
      break;
    }
  }
  return { errors, warnings };
}
