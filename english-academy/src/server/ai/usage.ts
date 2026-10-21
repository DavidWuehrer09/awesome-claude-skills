import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { aiRequests, users } from "@/db/schema";
import { AIError } from "./errors";

/**
 * AI allowances and budgets.
 *
 * Every AI feature belongs to an allowance category. Each user has a plan
 * (users.plan) with a monthly allowance per category. On top of that, the
 * operator sets global daily/monthly spending limits; when they are reached,
 * AI features pause for everyone while the rest of the app keeps working.
 *
 * Only real provider calls count: demo output costs nothing and is not counted.
 * Allowances count successful requests; budgets count the estimated cost of
 * every request, including failed ones (they are billed too).
 */

export const CATEGORIES = ["exercises", "exam_generation", "assessment", "tutor", "documents"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  exercises: "Exercises, word help and sentence feedback",
  exam_generation: "Exam generation",
  assessment: "Essay and exam assessment",
  tutor: "AI tutor messages",
  documents: "Document reading (photos, scans)",
};

const FEATURE_CATEGORY: Record<string, Category> = {
  enrich: "exercises", classify: "exercises", evaluate: "exercises", generate: "exercises", challenge: "exercises", mindmap: "exercises", writingPrompt: "exercises",
  parseList: "documents", examTranscribe: "documents", examProfileSuggest: "documents",
  examGenerate: "exam_generation",
  assess: "assessment", examAssess: "assessment", examDispute: "assessment",
  tutor: "tutor", examExplain: "tutor", examLab: "exercises", examDrills: "exercises",
};

export function categoryOf(feature: string): Category {
  return FEATURE_CATEGORY[feature] ?? "exercises";
}

const planSchema = z.object({
  label: z.string(),
  /** Successful AI requests per calendar month (UTC) and category; null = no limit. */
  monthly: z.record(z.enum(CATEGORIES), z.number().int().min(0).nullable()),
  /** Optional cap on this user's estimated AI cost per month, in USD. */
  monthlyUsd: z.number().min(0).nullable().default(null),
});
export type Plan = z.infer<typeof planSchema>;

/** Defaults; override the whole set with AI_PLANS (JSON) without code changes. */
export const DEFAULT_PLANS: Record<string, Plan> = {
  free: { label: "Free", monthly: { exercises: 60, exam_generation: 2, assessment: 4, tutor: 30, documents: 5 }, monthlyUsd: 2 },
  plus: { label: "Plus", monthly: { exercises: 600, exam_generation: 15, assessment: 30, tutor: 300, documents: 40 }, monthlyUsd: 15 },
  unlimited: { label: "Unlimited (operator)", monthly: { exercises: null, exam_generation: null, assessment: null, tutor: null, documents: null }, monthlyUsd: null },
};

let cached: { raw: string | undefined; plans: Record<string, Plan> } | null = null;
export function plans(): Record<string, Plan> {
  const raw = process.env.AI_PLANS;
  if (cached && cached.raw === raw) return cached.plans;
  let parsed = DEFAULT_PLANS;
  if (raw) {
    try {
      parsed = z.record(z.string(), planSchema).parse(JSON.parse(raw));
    } catch {
      console.error("AI_PLANS is not valid JSON in the expected format; using the default plans");
    }
  }
  cached = { raw, plans: parsed };
  return parsed;
}

export function planFor(planId: string): Plan {
  const all = plans();
  return all[planId] ?? all.free ?? Object.values(all)[0];
}

export function budgets() {
  const num = (v: string | undefined) => (v && Number(v) > 0 ? Number(v) : null);
  return { dailyUsd: num(process.env.AI_BUDGET_DAILY_USD), monthlyUsd: num(process.env.AI_BUDGET_MONTHLY_USD) };
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function nextMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
const dayStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const realProvider = sql`${aiRequests.provider} <> 'demo'`;

async function spend(db: Db, since: Date, userId?: string) {
  const [r] = await db.select({ usd: sql<number>`coalesce(sum(${aiRequests.estCostUsd}), 0)::float8` }).from(aiRequests)
    .where(and(gte(aiRequests.createdAt, since), realProvider, ...(userId ? [eq(aiRequests.userId, userId)] : [])));
  return Number(r.usd);
}

/** This month's successful real requests per category for one user. */
export async function usageByCategory(db: Db, userId: string, now = new Date()) {
  const rows = await db.select({ category: aiRequests.category, n: sql<number>`count(*)::int` }).from(aiRequests)
    .where(and(eq(aiRequests.userId, userId), gte(aiRequests.createdAt, monthStart(now)), eq(aiRequests.status, "ok"), realProvider))
    .groupBy(aiRequests.category);
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of rows) if ((CATEGORIES as readonly string[]).includes(r.category)) out[r.category as Category] = r.n;
  return out;
}

/** What the user sees: their plan, used and remaining requests, and when it resets. */
export async function allowanceFor(db: Db, userId: string, now = new Date()) {
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId));
  const plan = planFor(u?.plan ?? "free");
  const used = await usageByCategory(db, userId, now);
  return {
    plan: u?.plan ?? "free",
    planLabel: plan.label,
    resetsAt: nextMonthStart(now).toISOString(),
    categories: CATEGORIES.map((c) => ({ category: c, label: CATEGORY_LABEL[c], used: used[c], limit: plan.monthly[c] ?? null })),
  };
}

/**
 * Throws a friendly AIError when the request must not go to the provider:
 * global budget reached, the user's monthly cost cap reached, or the
 * category allowance used up.
 */
export async function assertWithinLimits(db: Db, userId: string, feature: string, now = new Date()) {
  const b = budgets();
  if (b.dailyUsd !== null && (await spend(db, dayStart(now))) >= b.dailyUsd) {
    throw new AIError("budget", "AI features are paused for today because this site's daily AI budget is used up. Everything else keeps working; AI is back tomorrow.");
  }
  if (b.monthlyUsd !== null && (await spend(db, monthStart(now))) >= b.monthlyUsd) {
    throw new AIError("budget", "AI features are paused until next month because this site's monthly AI budget is used up. Everything else keeps working.");
  }
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId));
  const plan = planFor(u?.plan ?? "free");
  const resets = nextMonthStart(now).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  if (plan.monthlyUsd !== null && (await spend(db, monthStart(now), userId)) >= plan.monthlyUsd) {
    throw new AIError("quota", `You have used this month's AI allowance on the ${plan.label} plan. It resets on ${resets}.`);
  }
  const category = categoryOf(feature);
  const limit = plan.monthly[category];
  if (limit !== null && limit !== undefined) {
    const used = (await usageByCategory(db, userId, now))[category];
    if (used >= limit) {
      throw new AIError("quota", `You have used all ${limit} ${CATEGORY_LABEL[category].toLowerCase()} requests included in the ${plan.label} plan this month. It resets on ${resets}.`, { category, used, limit });
    }
  }
}

// ---------------------------------------------------------------- operator report

export async function costReport(db: Db, now = new Date()) {
  const since = monthStart(now);
  const where = and(gte(aiRequests.createdAt, since), realProvider);
  const [today, month] = await Promise.all([spend(db, dayStart(now)), spend(db, since)]);
  const byFeature = await db.select({
    feature: aiRequests.feature, category: aiRequests.category, requests: sql<number>`count(*)::int`,
    failed: sql<number>`count(*) filter (where ${aiRequests.status} <> 'ok')::int`,
    inputTokens: sql<number>`coalesce(sum(${aiRequests.inputTokens}), 0)::int`, outputTokens: sql<number>`coalesce(sum(${aiRequests.outputTokens}), 0)::int`,
    usd: sql<number>`coalesce(sum(${aiRequests.estCostUsd}), 0)::float8`,
    unpriced: sql<number>`count(*) filter (where ${aiRequests.estCostUsd} is null and ${aiRequests.inputTokens} is not null)::int`,
  }).from(aiRequests).where(where).groupBy(aiRequests.feature, aiRequests.category).orderBy(desc(sql`4`));
  const byDay = await db.select({ day: sql<string>`to_char(date_trunc('day', ${aiRequests.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, usd: sql<number>`coalesce(sum(${aiRequests.estCostUsd}), 0)::float8`, requests: sql<number>`count(*)::int` })
    .from(aiRequests).where(where).groupBy(sql`1`).orderBy(sql`1`);
  const topUsers = await db.select({ userId: aiRequests.userId, email: users.email, plan: users.plan, requests: sql<number>`count(*)::int`, usd: sql<number>`coalesce(sum(${aiRequests.estCostUsd}), 0)::float8` })
    .from(aiRequests).innerJoin(users, eq(users.id, aiRequests.userId)).where(where).groupBy(aiRequests.userId, users.email, users.plan)
    .orderBy(desc(sql`5`)).limit(20);
  const [{ n: userCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const planCounts = await db.select({ plan: users.plan, n: sql<number>`count(*)::int` }).from(users).groupBy(users.plan);
  const errors = await db.select({ code: aiRequests.errorCode, n: sql<number>`count(*)::int` }).from(aiRequests)
    .where(and(where, inArray(aiRequests.status, ["error", "refused", "rate_limited", "invalid_output"]))).groupBy(aiRequests.errorCode);
  return {
    monthStart: since.toISOString(), budgets: budgets(), spend: { todayUsd: today, monthUsd: month },
    byFeature, byDay, topUsers, userCount, planCounts, errors, plans: plans(),
  };
}

export async function setUserPlan(db: Db, userId: string, plan: string) {
  if (!plans()[plan]) throw new AIError("bad_request", `Unknown plan “${plan}”`);
  const r = await db.update(users).set({ plan }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!r.length) throw new AIError("bad_request", "User not found");
}
