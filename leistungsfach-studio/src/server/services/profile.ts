import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { MODES } from "@/lib/curriculum";
import { getDb, schema } from "@/server/db/client";

export async function getProfile() {
  const db = await getDb();
  const rows = await db.select().from(schema.learnerProfile).where(eq(schema.learnerProfile.id, "me"));
  if (rows[0]) return rows[0];
  const [created] = await db.insert(schema.learnerProfile).values({ id: "me" }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.learnerProfile).where(eq(schema.learnerProfile.id, "me")))[0];
}

export const ProfileUpdate = z.object({
  displayName: z.string().max(80).optional(),
  yearLevel: z.number().int().min(11).max(13).optional(),
  targetPoints: z.number().int().min(0).max(15).optional(),
  defaultMode: z.enum(MODES).optional(),
  useReportedWeighting: z.boolean().optional(),
  goals: z.string().max(2000).optional(),
});

export async function updateProfile(input: z.infer<typeof ProfileUpdate>) {
  await getProfile();
  const db = await getDb();
  const [row] = await db.update(schema.learnerProfile).set({ ...input, updatedAt: new Date() }).where(eq(schema.learnerProfile.id, "me")).returning();
  return row;
}
