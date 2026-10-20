import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse, HttpError } from "@/server/http";
import { runReminderJob } from "@/server/notifications";

export const dynamic = "force-dynamic";

/** Called by a scheduler (e.g. Vercel Cron) every 15–30 minutes with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET;
    const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      throw new HttpError(401, "Unauthorized", "unauthorized");
    }
    const results = await runReminderJob(await getDb());
    return NextResponse.json({ ran: new Date().toISOString(), sent: results.filter((r) => r.status === "sent").length, results: results.map(({ channel, status }) => ({ channel, status })) });
  } catch (e) {
    return errorResponse(e);
  }
}
