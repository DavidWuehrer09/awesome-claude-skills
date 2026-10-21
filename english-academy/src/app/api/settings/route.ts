import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { topics, userSettings } from "@/db/schema";
import { isValidTimeZone } from "@/lib/time";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
  targetLevel: z.enum(["B2", "C1", "C2"]).optional(),
  mainGoal: z.string().trim().max(200).nullish(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  sessionMinutes: z.number().int().min(3).max(120).optional(),
  dailyNewLimit: z.number().int().min(0).max(100).optional(),
  dailyReviewLimit: z.number().int().min(10).max(1000).optional(),
  requestRetention: z.number().min(0.75).max(0.97).optional(),
  typoTolerance: z.enum(["strict", "normal", "lenient"]).optional(),
  reminderTime: hhmm.optional(),
  reminderDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  quietStart: hhmm.optional(),
  quietEnd: hhmm.optional(),
  pushEnabled: z.boolean().optional(),
  pushPromptDeclined: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  aiProfileConsent: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  reducedMotion: z.boolean().optional(),
  showStreak: z.boolean().optional(),
  onboarded: z.boolean().optional(),
  targetTopicIds: z.array(z.string().uuid()).max(20).optional(),
  studyIntensity: z.enum(["light", "normal", "intensive"]).optional(),
  preferredStudyTime: hhmm.nullish(),
  weeklySummaryEmail: z.boolean().optional(),
});

export const PATCH = route(async (req) => {
  const { user, db } = await ctx();
  const patch = await parseJson(req, schema);
  if (patch.targetTopicIds?.length) {
    // Only the learner's own topics can be study targets.
    const own = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.userId, user.id), inArray(topics.id, patch.targetTopicIds)));
    patch.targetTopicIds = own.map((t) => t.id);
  }
  const [row] = await db.update(userSettings).set({ ...patch, updatedAt: new Date() }).where(eq(userSettings.userId, user.id)).returning();
  return { settings: row };
});
