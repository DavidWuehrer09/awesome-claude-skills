import { NextResponse } from "next/server";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { exportExaminer } from "@/server/repos/examiner";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return new NextResponse(JSON.stringify(await exportExaminer(db, user.id), null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="my-english-examiner-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
