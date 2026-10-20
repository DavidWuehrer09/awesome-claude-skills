import { NextResponse } from "next/server";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { exportAccount } from "@/server/repos/account";

export const GET = route(async () => {
  const { user, db } = await ctx();
  const data = await exportAccount(db, user.id);
  const json = JSON.stringify(data, (_k, v) => (v && typeof v === "object" && v.type === "Buffer" ? undefined : v), 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="english-academy-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
