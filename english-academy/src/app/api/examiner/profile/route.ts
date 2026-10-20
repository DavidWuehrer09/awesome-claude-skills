import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { addProfileEntries, courseSchema, getProfile, profileEntrySchema, updateCourse } from "@/server/repos/examiner";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return getProfile(db, user.id);
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { entries } = await parseJson(req, z.object({ entries: z.array(profileEntrySchema).min(1).max(30) }));
  return { entries: await addProfileEntries(db, user.id, entries) };
});

/** Course details and checked official guidance. */
export const PATCH = route(async (req) => {
  const { user, db } = await ctx();
  return { course: await updateCourse(db, user.id, await parseJson(req, courseSchema)) };
});
