import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { globalSearch } from "@/server/repos/vocab";

export const GET = route(async (req) => {
  const { user, db } = await ctx();
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  return globalSearch(db, user.id, q);
});
