import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { createEntry, entryInputSchema, listEntries, type SmartList } from "@/server/repos/vocab";

export const GET = route(async (req) => {
  const { user, db } = await ctx();
  const sp = req.nextUrl.searchParams;
  const { rows, total } = await listEntries(db, user.id, {
    q: sp.get("q") ?? undefined,
    topicId: sp.get("topic") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    list: (sp.get("list") as SmartList) ?? "all",
    limit: Number(sp.get("limit") ?? 200),
    offset: Number(sp.get("offset") ?? 0),
  });
  return { total, items: rows.map((r) => ({ ...r.entry, state: r.state })) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const body = await parseJson(req, entryInputSchema);
  return { entry: await createEntry(db, user.id, body) };
});

export const dynamic = "force-dynamic";
