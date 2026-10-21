import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { splitTopic } from "@/server/repos/vocab";

const schema = z.object({ name: z.string().trim().min(1).max(80), entryIds: z.array(z.string().uuid()).min(1).max(1000) });

/** Create a subtopic and move the selected words into it. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return splitTopic(db, user.id, id, await parseJson(req, schema));
});
