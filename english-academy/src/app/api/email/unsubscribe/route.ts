import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { userSettings } from "@/db/schema";
import { verifyUnsubscribe } from "@/server/notifications";

async function handle(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(u) || !verifyUnsubscribe(u, t)) {
    return new NextResponse("This unsubscribe link is invalid.", { status: 400 });
  }
  await (await getDb()).update(userSettings).set({ emailEnabled: false }).where(eq(userSettings.userId, u));
  return new NextResponse("You will no longer receive reminder emails. You can re-enable them in Settings.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = handle;
export const POST = handle; // RFC 8058 one-click unsubscribe
