import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { runAI } from "@/lib/ai/client";
import { LearnerUpdateOutputSchema, type AssessmentOutput } from "@/lib/ai/schemas";
import { buildLearnerUpdatePrompt, validateLearnerUpdate, type KnownPattern } from "@/lib/ai/prompts/learnerUpdate";
import { computeSkill, patternStatus, MASTERY_LABEL, type EvidenceItem, type PatternState } from "@/lib/learner/model";
import { SKILL_KEYS, SKILLS, isSkillKey, type SkillKey } from "@/lib/learner/skills";
import { scheduleNext } from "@/lib/learner/spaced";
import { containsQuote, normalizeLabel } from "@/lib/text/normalize";
import { getDb, schema } from "@/server/db/client";
import { notFound } from "@/server/http";
import { log } from "@/server/log";

type Occurrence = { submissionKey: string; at: string; quote: string; correction: string; sourceType: string };
type Clean = { submissionKey: string; at: string; isTransfer: boolean };

export type Observation = { skill_key: SkillKey; polarity: "strength" | "weakness" | "neutral"; quote: string; note: string; level_estimate: number | null };
export type EvidenceSource = { sourceType: "assessment" | "exercise" | "teacher" | "manual_note"; sourceId: string; submissionKey: string; essayId: string | null; isTransfer: boolean };

// ---------- recomputation ----------

export async function recomputeSkill(skillKey: SkillKey) {
  const db = await getDb();
  const ev = await db.select().from(schema.skillEvidence)
    .where(and(eq(schema.skillEvidence.skillKey, skillKey), isNull(schema.skillEvidence.dismissedAt)));
  const patterns = await db.select().from(schema.errorPatterns)
    .where(and(eq(schema.errorPatterns.skillKey, skillKey), isNull(schema.errorPatterns.dismissedAt)));
  const items: EvidenceItem[] = ev
    .filter((e) => e.sourceType !== "manual_note")
    .map((e) => ({
      skillKey, submissionKey: e.submissionKey, sourceType: e.sourceType as EvidenceItem["sourceType"],
      polarity: e.polarity as EvidenceItem["polarity"], levelEstimate: e.levelEstimate, isTransfer: e.isTransfer, createdAt: e.createdAt,
    }));
  const pStates: PatternState[] = patterns.map((p) => ({ skillKey, occurrences: p.occurrences as Occurrence[], cleanSubmissions: p.cleanSubmissions as Clean[] }));
  const c = computeSkill(items, pStates);
  await db.insert(schema.skillStates).values({ skillKey, ...c, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.skillStates.skillKey, set: { ...c, updatedAt: new Date() } });
  return c;
}

export async function recomputeAllSkills() {
  for (const k of SKILL_KEYS) await recomputeSkill(k);
}

async function savePatternStatus(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.id, id));
  if (!p) return;
  const status = patternStatus({ skillKey: p.skillKey as SkillKey, occurrences: p.occurrences as Occurrence[], cleanSubmissions: p.cleanSubmissions as Clean[] });
  const patch: Partial<typeof schema.errorPatterns.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "recurring" && !p.nextReviewAt) {
    const s = scheduleNext(0, "correct");
    patch.reviewIntervalDays = s.intervalDays;
    patch.nextReviewAt = s.nextReviewAt;
  }
  if (status === "resolved_provisional") patch.nextReviewAt = null;
  await db.update(schema.errorPatterns).set(patch).where(eq(schema.errorPatterns.id, id));
}

/** Removes a submission's occurrences/clean records from all patterns (essay deleted or re-assessed). */
export async function removeSubmissionFromPatterns(submissionKey: string) {
  const db = await getDb();
  const patterns = await db.select().from(schema.errorPatterns);
  for (const p of patterns) {
    const occ = (p.occurrences as Occurrence[]).filter((o) => o.submissionKey !== submissionKey);
    const clean = (p.cleanSubmissions as Clean[]).filter((o) => o.submissionKey !== submissionKey);
    if (occ.length === (p.occurrences as Occurrence[]).length && clean.length === (p.cleanSubmissions as Clean[]).length) continue;
    if (!occ.length) {
      await db.delete(schema.errorPatterns).where(eq(schema.errorPatterns.id, p.id));
    } else {
      await db.update(schema.errorPatterns).set({ occurrences: occ, cleanSubmissions: clean }).where(eq(schema.errorPatterns.id, p.id));
      await savePatternStatus(p.id);
    }
  }
}

// ---------- writing evidence ----------

export async function addObservations(observations: Observation[], src: EvidenceSource) {
  if (!observations.length) return;
  const db = await getDb();
  await db.insert(schema.skillEvidence).values(observations.map((o) => ({
    skillKey: o.skill_key, sourceType: src.sourceType, sourceId: src.sourceId, submissionKey: src.submissionKey, essayId: src.essayId,
    polarity: o.polarity, levelEstimate: o.level_estimate, quote: o.quote, note: o.note, isTransfer: src.isTransfer,
  })));
}

export async function recordPatternOccurrence(input: { patternId?: string | null; label: string; category: string; skillKey: SkillKey; explanation: string; occurrence: Occurrence }) {
  const db = await getDb();
  const norm = normalizeLabel(input.label);
  let existing = input.patternId
    ? (await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.id, input.patternId)))[0]
    : undefined;
  existing ??= (await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.normalizedLabel, norm)))[0];
  if (existing) {
    const occ = (existing.occurrences as Occurrence[]).filter((o) => !(o.submissionKey === input.occurrence.submissionKey && o.quote === input.occurrence.quote));
    occ.push(input.occurrence);
    const clean = (existing.cleanSubmissions as Clean[]).filter((c) => c.submissionKey !== input.occurrence.submissionKey);
    await db.update(schema.errorPatterns).set({ occurrences: occ, cleanSubmissions: clean, dismissedAt: null, dismissedReason: null }).where(eq(schema.errorPatterns.id, existing.id));
    await savePatternStatus(existing.id);
    return existing.id;
  }
  const [row] = await db.insert(schema.errorPatterns).values({
    skillKey: input.skillKey, label: input.label.trim(), normalizedLabel: norm, category: input.category, explanation: input.explanation,
    occurrences: [input.occurrence], cleanSubmissions: [],
  }).onConflictDoNothing().returning();
  if (row) await savePatternStatus(row.id);
  return row?.id ?? null;
}

export async function recordPatternClean(patternId: string, clean: Clean) {
  const db = await getDb();
  const [p] = await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.id, patternId));
  if (!p) return;
  if ((p.occurrences as Occurrence[]).some((o) => o.submissionKey === clean.submissionKey)) return;
  const list = (p.cleanSubmissions as Clean[]).filter((c) => c.submissionKey !== clean.submissionKey);
  list.push(clean);
  await db.update(schema.errorPatterns).set({ cleanSubmissions: list }).where(eq(schema.errorPatterns.id, patternId));
  await savePatternStatus(patternId);
}

async function knownPatternsForPrompt(): Promise<KnownPattern[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.errorPatterns).where(isNull(schema.errorPatterns.dismissedAt)).orderBy(desc(schema.errorPatterns.updatedAt)).limit(40);
  return rows.map((r) => ({ id: r.id, label: r.label, category: r.category, status: r.status }));
}

/** Text that the AI wrote for the parent essay's accepted revision edits — not the student's own production. */
async function aiAuthorshipCheckFor(essayId: string): Promise<(quote: string) => boolean> {
  const db = await getDb();
  const [essay] = await db.select({ parentEssayId: schema.essays.parentEssayId }).from(schema.essays).where(eq(schema.essays.id, essayId));
  if (!essay?.parentEssayId) return () => false;
  const [parent] = await db.select({ essayText: schema.essays.essayText }).from(schema.essays).where(eq(schema.essays.id, essay.parentEssayId));
  const revs = await db.select().from(schema.revisions).where(and(eq(schema.revisions.essayId, essay.parentEssayId), eq(schema.revisions.status, "completed")));
  const aiTexts: string[] = [];
  for (const r of revs) {
    const edits = (r.edits as { id: string; revised_text: string }[] | null) ?? [];
    const states = r.editStates as Record<string, string>;
    for (const e of edits) if (states[e.id] !== "rejected" && e.revised_text.trim()) aiTexts.push(e.revised_text);
  }
  const original = parent?.essayText ?? "";
  return (quote: string) => Boolean(quote) && aiTexts.some((t) => containsQuote(t, quote)) && !containsQuote(original, quote);
}

function summariseAssessment(a: AssessmentOutput, score: { low: number | null; high: number | null }) {
  return [
    `Estimated range: ${score.low}–${score.high} / 15.`,
    `Strengths: ${a.strengths.map((s) => s.title).join("; ")}`,
    `Weaknesses: ${a.weaknesses.map((w) => `${w.title} (${w.severity}, ${w.dimension})`).join("; ")}`,
    `Dimensions: ${a.dimensions.map((d) => `${d.key} ${d.low}-${d.high}`).join(", ")}`,
  ].join("\n");
}

/**
 * Learner update after an assessment. Supersedes earlier assessment evidence for the same essay
 * (re-assessing in another mode must not double-count one piece of work).
 */
export async function applyAssessmentLearnerUpdate(assessmentId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessmentId));
  if (!a || a.status !== "completed" || !a.result) throw notFound("Completed assessment");
  const [essay] = await db.select().from(schema.essays).where(eq(schema.essays.id, a.essayId));
  const known = await knownPatternsForPrompt();
  const { system, user } = buildLearnerUpdatePrompt({
    studentText: essay.essayText,
    assessmentSummary: summariseAssessment(a.result as AssessmentOutput, { low: a.scoreLow, high: a.scoreHigh }),
    knownPatterns: known,
    kind: "essay",
  });
  const { data } = await runAI({
    operation: "learner_update", system, user, schema: LearnerUpdateOutputSchema, effort: "medium", maxTokens: 8000,
    relatedId: assessmentId,
    validate: (o) => validateLearnerUpdate(o, { studentText: essay.essayText, knownPatternIds: known.map((k) => k.id) }),
    mockContext: { studentText: essay.essayText, knownPatterns: known },
  });

  const isAiAuthored = await aiAuthorshipCheckFor(essay.id);
  const observations = data.observations.filter((o) => !isAiAuthored(o.quote));
  const skipped = data.observations.length - observations.length;

  await db.update(schema.skillEvidence).set({ dismissedAt: new Date(), dismissedReason: "Superseded by a newer assessment of the same essay" })
    .where(and(eq(schema.skillEvidence.essayId, essay.id), eq(schema.skillEvidence.sourceType, "assessment"), isNull(schema.skillEvidence.dismissedAt)));
  await removeSubmissionFromPatterns(essay.id);

  const src: EvidenceSource = { sourceType: "assessment", sourceId: assessmentId, submissionKey: essay.id, essayId: essay.id, isTransfer: false };
  await addObservations(observations, src);

  // Time management evidence from timed work (deterministic, labelled as derived).
  if (essay.timeLimitMinutes && essay.timeUsedMinutes != null) {
    const ratio = essay.timeUsedMinutes / essay.timeLimitMinutes;
    await addObservations([{
      skill_key: "time_management", polarity: ratio <= 1 ? "strength" : "weakness", quote: "",
      note: `Derived from time used (${essay.timeUsedMinutes} of ${essay.timeLimitMinutes} min).`,
      level_estimate: ratio <= 1 ? 12 : ratio <= 1.1 ? 9 : 6,
    }], src);
  }

  const at = new Date().toISOString();
  for (const p of data.error_patterns) {
    if (isAiAuthored(p.example_quote)) continue;
    await recordPatternOccurrence({
      patternId: p.existing_pattern_id, label: p.label, category: p.category, skillKey: p.skill_key, explanation: p.explanation,
      occurrence: { submissionKey: essay.id, at, quote: p.example_quote, correction: p.correction, sourceType: "assessment" },
    });
  }
  for (const id of data.checked_absent_pattern_ids) await recordPatternClean(id, { submissionKey: essay.id, at, isTransfer: false });

  await recomputeAllSkills();
  log.info("learner.updated", { assessmentId, observations: observations.length, skippedAiAuthored: skipped, patterns: data.error_patterns.length });
  return { observations: observations.length, patterns: data.error_patterns.length, skippedAiAuthored: skipped };
}

// ---------- reading ----------

export async function getLearnerOverview() {
  const db = await getDb();
  const [states, evidence, patterns] = await Promise.all([
    db.select().from(schema.skillStates),
    db.select().from(schema.skillEvidence).orderBy(desc(schema.skillEvidence.createdAt)).limit(500),
    db.select().from(schema.errorPatterns).orderBy(desc(schema.errorPatterns.updatedAt)),
  ]);
  const essays = await db.select({ id: schema.essays.id, title: schema.essays.title }).from(schema.essays);
  const essayTitle = new Map(essays.map((e) => [e.id, e.title]));
  return {
    skills: SKILL_KEYS.map((k) => {
      const s = states.find((x) => x.skillKey === k);
      return {
        key: k, label: SKILLS[k].label, description: SKILLS[k].description, group: SKILLS[k].group,
        level: s?.level ?? null, confidence: s?.confidence ?? 0, trend: s?.trend ?? "insufficient_data",
        masteryStatus: s?.masteryStatus ?? "not_assessed", masteryLabel: MASTERY_LABEL[(s?.masteryStatus ?? "not_assessed") as keyof typeof MASTERY_LABEL],
        evidenceCount: s?.evidenceCount ?? 0, sourceCount: s?.sourceCount ?? 0,
        recommendedAction: s?.recommendedAction || "No evidence yet — an essay or a diagnostic exercise will show where you stand.",
        evidence: evidence.filter((e) => e.skillKey === k).map((e) => ({ ...e, essayTitle: e.essayId ? essayTitle.get(e.essayId) ?? null : null })),
        patterns: patterns.filter((p) => p.skillKey === k),
      };
    }),
    patterns,
  };
}

export async function learnerSummaryForPrompt(): Promise<string> {
  const db = await getDb();
  const states = await db.select().from(schema.skillStates);
  const patterns = await db.select().from(schema.errorPatterns).where(and(isNull(schema.errorPatterns.dismissedAt), sql`${schema.errorPatterns.status} in ('recurring','improving')`)).limit(12);
  const notes = await db.select().from(schema.skillEvidence).where(and(eq(schema.skillEvidence.sourceType, "manual_note"), isNull(schema.skillEvidence.dismissedAt))).limit(10);
  const assessed = states.filter((s) => s.level !== null);
  if (!assessed.length && !patterns.length && !notes.length) return "";
  return [
    assessed.length ? "Skill estimates (from previous work; level 0–15, confidence 0–1):\n" + assessed.map((s) => `- ${s.skillKey}: ${s.level} (conf ${s.confidence}, ${s.masteryStatus}, trend ${s.trend})`).join("\n") : "",
    patterns.length ? "Known recurring error patterns:\n" + patterns.map((p) => `- ${p.label} [${p.category}, ${p.status}]`).join("\n") : "",
    notes.length ? "Notes added by the student:\n" + notes.map((n) => `- (${n.skillKey}) ${n.note}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");
}

// ---------- student control ----------

export const DismissInput = z.object({ reason: z.string().trim().min(1, "Please say briefly why this is inaccurate.").max(500) });

export async function dismissEvidence(id: string, reason: string) {
  const db = await getDb();
  const [row] = await db.update(schema.skillEvidence).set({ dismissedAt: new Date(), dismissedReason: reason }).where(eq(schema.skillEvidence.id, id)).returning();
  if (!row) throw notFound("Evidence");
  if (isSkillKey(row.skillKey)) await recomputeSkill(row.skillKey);
  return row;
}

export async function restoreEvidence(id: string) {
  const db = await getDb();
  const [row] = await db.update(schema.skillEvidence).set({ dismissedAt: null, dismissedReason: null }).where(eq(schema.skillEvidence.id, id)).returning();
  if (!row) throw notFound("Evidence");
  if (isSkillKey(row.skillKey)) await recomputeSkill(row.skillKey);
  return row;
}

export async function dismissPattern(id: string, reason: string) {
  const db = await getDb();
  const [row] = await db.update(schema.errorPatterns).set({ dismissedAt: new Date(), dismissedReason: reason, nextReviewAt: null }).where(eq(schema.errorPatterns.id, id)).returning();
  if (!row) throw notFound("Error pattern");
  if (isSkillKey(row.skillKey)) await recomputeSkill(row.skillKey);
  return row;
}

export const ManualNoteInput = z.object({ skillKey: z.enum(SKILL_KEYS), note: z.string().trim().min(3).max(1000) });

export async function addManualNote(input: z.infer<typeof ManualNoteInput>) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const [row] = await db.insert(schema.skillEvidence).values({
    skillKey: input.skillKey, sourceType: "manual_note", sourceId: id, submissionKey: `note:${id}`, polarity: "neutral", levelEstimate: null, note: input.note,
  }).returning();
  return row;
}

export async function resetSkill(skillKey: SkillKey) {
  const db = await getDb();
  await db.update(schema.skillEvidence).set({ dismissedAt: new Date(), dismissedReason: "Skill reset by student" })
    .where(and(eq(schema.skillEvidence.skillKey, skillKey), isNull(schema.skillEvidence.dismissedAt)));
  await db.update(schema.errorPatterns).set({ dismissedAt: new Date(), dismissedReason: "Skill reset by student" })
    .where(and(eq(schema.errorPatterns.skillKey, skillKey), isNull(schema.errorPatterns.dismissedAt)));
  return recomputeSkill(skillKey);
}
