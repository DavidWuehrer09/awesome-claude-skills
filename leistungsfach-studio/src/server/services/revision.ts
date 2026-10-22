import "server-only";
import { desc, eq } from "drizzle-orm";
import { runAI } from "@/lib/ai/client";
import { ExplanationOutputSchema, RevisionOutputSchema, type AssessmentOutput } from "@/lib/ai/schemas";
import {
  buildExplanationPrompt, buildRevisionPrompt, REVISION_PROMPT_VERSION, validateExplanation, validateRevision, type RevisionDepth,
} from "@/lib/ai/prompts/revision";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/types";
import type { TaskTypeKey } from "@/lib/curriculum";
import { buildRevisionDocument, type EditState, type StoredEdit } from "@/lib/text/revisionDoc";
import { segmentEssay, type Sentence } from "@/lib/text/segment";
import { getDb, schema } from "@/server/db/client";
import { AppError, notFound } from "@/server/http";
import { getEssay } from "./essays";
import { latestCompletedAssessment } from "./assessment";

export async function createRevision(essayId: string, depth: RevisionDepth) {
  const db = await getDb();
  const essay = await getEssay(essayId);
  const sentences = segmentEssay(essay.essayText);
  if (sentences.length === 0) throw new AppError("empty_essay", "The essay has no sentences to revise.");
  const assessment = await latestCompletedAssessment(essayId);
  const result = assessment?.result as AssessmentOutput | undefined;
  const priorities = result
    ? [
      ...result.weaknesses.filter((w) => w.severity === "major").map((w) => `${w.title}: ${w.how_to_fix}`),
      ...result.action_plan.sort((a, b) => a.priority - b.priority).map((a) => a.action),
    ].slice(0, 6)
    : [];
  const { system, user } = buildRevisionPrompt({
    depth, taskType: essay.taskType as TaskTypeKey, operator: essay.operator, taskPrompt: essay.taskPrompt, sourceText: essay.sourceText, sentences, priorities,
  });
  try {
    const { data, provider, model } = await runAI({
      operation: "revision", system, user, schema: RevisionOutputSchema, effort: depth === "corrections" ? "medium" : "high", maxTokens: 32000, relatedId: essayId,
      validate: (o) => validateRevision(o, { sentences, sourceText: essay.sourceText, essayText: essay.essayText }),
      mockContext: { sentences },
    });
    const edits: StoredEdit[] = data.edits.map((e, i) => ({ id: `e${i + 1}`, ...e }));
    const [row] = await db.insert(schema.revisions).values({
      essayId, assessmentId: assessment?.id ?? null, depth, status: "completed", sentences, edits, editStates: {}, overview: data.overview,
      provider, model, promptVersion: REVISION_PROMPT_VERSION,
    }).returning();
    return row;
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    const [failed] = await db.insert(schema.revisions).values({ essayId, depth, status: "failed", errorMessage: AI_ERROR_MESSAGES[e.code], promptVersion: REVISION_PROMPT_VERSION }).returning();
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502, { revisionId: failed.id });
  }
}

export async function getRevisionView(id: string) {
  const db = await getDb();
  const [rev] = await db.select().from(schema.revisions).where(eq(schema.revisions.id, id));
  if (!rev) throw notFound("Revision");
  const essay = await getEssay(rev.essayId);
  const explanations = await db.select().from(schema.revisionExplanations).where(eq(schema.revisionExplanations.revisionId, id)).orderBy(desc(schema.revisionExplanations.createdAt));
  const doc = rev.status === "completed"
    ? buildRevisionDocument(rev.sentences as Sentence[], rev.edits as StoredEdit[], rev.editStates as Record<string, EditState>)
    : null;
  return { revision: rev, essay: { id: essay.id, title: essay.title, taskType: essay.taskType, essayText: essay.essayText }, doc, explanations };
}

export async function listRevisions() {
  const db = await getDb();
  const rows = await db.select({
    id: schema.revisions.id, essayId: schema.revisions.essayId, depth: schema.revisions.depth, status: schema.revisions.status,
    createdAt: schema.revisions.createdAt, provider: schema.revisions.provider, title: schema.essays.title,
  }).from(schema.revisions).innerJoin(schema.essays, eq(schema.essays.id, schema.revisions.essayId)).orderBy(desc(schema.revisions.createdAt));
  return rows;
}

export async function setEditState(revisionId: string, editId: string, state: EditState) {
  const db = await getDb();
  const [rev] = await db.select().from(schema.revisions).where(eq(schema.revisions.id, revisionId));
  if (!rev) throw notFound("Revision");
  if (!(rev.edits as StoredEdit[] | null)?.some((e) => e.id === editId)) throw notFound("Change");
  const states = { ...(rev.editStates as Record<string, EditState>), [editId]: state };
  await db.update(schema.revisions).set({ editStates: states }).where(eq(schema.revisions.id, revisionId));
  return getRevisionView(revisionId);
}

export async function explainEdit(revisionId: string, editId: string, question: string) {
  const db = await getDb();
  const view = await getRevisionView(revisionId);
  const item = view.doc?.paragraphs.flatMap((p) => p.items).find((i) => i.kind === "edit" && i.edit.id === editId);
  if (!item || item.kind !== "edit") throw notFound("Change");
  const { system, user } = buildExplanationPrompt({
    original: item.original, revised: item.edit.revised_text, category: item.edit.category, explanation: item.edit.explanation,
    principle: item.edit.principle, taskType: view.essay.taskType as TaskTypeKey, question,
  });
  try {
    const { data } = await runAI({ operation: "explanation", system, user, schema: ExplanationOutputSchema, effort: "medium", maxTokens: 6000, relatedId: revisionId, validate: validateExplanation });
    const [row] = await db.insert(schema.revisionExplanations).values({ revisionId, editId, question, result: data }).returning();
    return row;
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502);
  }
}
