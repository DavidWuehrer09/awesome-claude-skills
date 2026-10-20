import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { vocabEntries } from "@/db/schema";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteEntries, setMembership } from "@/server/repos/vocab";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string().uuid()).min(1).max(1000) }),
  z.object({ action: z.literal("favorite"), ids: z.array(z.string().uuid()).min(1).max(1000), value: z.boolean() }),
  z.object({ action: z.enum(["add", "remove"]), ids: z.array(z.string().uuid()).min(1).max(1000), topicId: z.string().uuid() }),
  z.object({ action: z.literal("move"), ids: z.array(z.string().uuid()).min(1).max(1000), topicId: z.string().uuid(), fromTopicId: z.string().uuid() }),
]);

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const body = await parseJson(req, schema);
  switch (body.action) {
    case "delete":
      return { affected: await deleteEntries(db, user.id, body.ids) };
    case "favorite": {
      const r = await db.update(vocabEntries).set({ favorite: body.value }).where(and(eq(vocabEntries.userId, user.id), inArray(vocabEntries.id, body.ids))).returning({ id: vocabEntries.id });
      return { affected: r.length };
    }
    case "move":
      return { affected: await setMembership(db, user.id, body.ids, body.topicId, "move", body.fromTopicId) };
    default:
      return { affected: await setMembership(db, user.id, body.ids, body.topicId, body.action) };
  }
});
