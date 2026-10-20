import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { createDraft, listDrafts } from "@/server/repos/writing";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { drafts: await listDrafts(db, user.id) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const body = await parseJson(req, z.object({ title: z.string().max(160).optional(), body: z.string().max(60000).optional() }));
  return { draft: await createDraft(db, user.id, null, body.title, body.body ?? "") };
});
