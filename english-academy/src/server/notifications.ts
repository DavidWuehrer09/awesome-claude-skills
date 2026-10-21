import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "@/db/client";
import { pushSubscriptions, reminderDeliveries, userSettings, users } from "@/db/schema";
import { inWindow, localDateString, localMinutesOfDay, localWeekday, parseHHMM } from "@/lib/time";
import { log } from "./log";
import { weeklySummary } from "./repos/planning";
import { dashboardCounts } from "./repos/progress";

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}
export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

let vapidSet = false;
function ensureVapid() {
  if (!vapidSet && pushConfigured()) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidSet = true;
  }
}

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET (≥32 chars) is required for signed links");
  return s;
}

export function unsubscribeToken(userId: string) {
  return createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribe(userId: string, token: string) {
  try {
    const a = Buffer.from(unsubscribeToken(userId));
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ReminderOutcome = { userId: string; channel: "push" | "email" | "weekly"; status: string };

/**
 * Decide whether a reminder is due for this user now. Pure apart from the
 * clock: the user's local reminder time must have passed, today must be a
 * selected weekday, and quiet hours must not be active.
 */
export function reminderDue(now: Date, s: { timezone: string; reminderTime: string; reminderDays: number[]; quietStart: string; quietEnd: string }) {
  const minutes = localMinutesOfDay(now, s.timezone);
  if (!s.reminderDays.includes(localWeekday(now, s.timezone))) return false;
  if (minutes < parseHHMM(s.reminderTime)) return false;
  if (inWindow(minutes, parseHHMM(s.quietStart), parseHHMM(s.quietEnd))) return false;
  return true;
}

/** Claim (user, channel, local date) exactly once; retries of the job cannot double-send. */
async function claim(db: Db, userId: string, channel: "push" | "email" | "weekly", localDate: string) {
  const rows = await db.insert(reminderDeliveries).values({ userId, channel, localDate, status: "claimed", attempts: 1 })
    .onConflictDoNothing().returning();
  if (rows[0]) return rows[0];
  // A failed delivery may be retried (up to 3 attempts); the conditional update keeps this atomic.
  const retried = await db.update(reminderDeliveries)
    .set({ status: "claimed", attempts: sql`${reminderDeliveries.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(reminderDeliveries.userId, userId), eq(reminderDeliveries.channel, channel), eq(reminderDeliveries.localDate, localDate),
      eq(reminderDeliveries.status, "failed"), lt(reminderDeliveries.attempts, 3)))
    .returning();
  return retried[0] ?? null;
}

async function finish(db: Db, id: string, status: string, detail?: string) {
  await db.update(reminderDeliveries).set({ status, detail: detail?.slice(0, 120) ?? null, updatedAt: new Date() }).where(eq(reminderDeliveries.id, id));
}

export async function sendPush(db: Db, userId: string, payload: { title: string; body: string; url: string }) {
  ensureVapid();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      delivered++;
      if (s.failureCount) await db.update(pushSubscriptions).set({ failureCount: 0 }).where(eq(pushSubscriptions.id, s.id));
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); // expired subscription
      else await db.update(pushSubscriptions).set({ failureCount: s.failureCount + 1 }).where(eq(pushSubscriptions.id, s.id));
      log.warn("push_failed", { status: status ?? null });
    }
  }
  return { delivered, subscriptions: subs.length };
}

export async function sendEmail(to: string, subject: string, text: string, html: string, unsubscribeUrl: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, to, subject, text, html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`email_http_${res.status}`);
}

/** Scheduled job (cron): send at most one reminder per user, channel and local day. */
export async function runReminderJob(db: Db, now = new Date(), baseUrl = process.env.APP_URL ?? "http://localhost:3000") {
  const rows = await db.select({ s: userSettings, email: users.email }).from(userSettings).innerJoin(users, eq(users.id, userSettings.userId))
    .where(and(eq(userSettings.onboarded, true)));
  const out: ReminderOutcome[] = [];
  for (const { s, email } of rows) {
    // Weekly summary e-mail: Sundays after the reminder time, once per week (own opt-in).
    if (s.weeklySummaryEmail && emailConfigured() && localWeekday(now, s.timezone) === 0 && localMinutesOfDay(now, s.timezone) >= parseHHMM(s.reminderTime)) {
      const c = await claim(db, s.userId, "weekly", localDateString(now, s.timezone));
      if (c) {
        const w = await weeklySummary(db, s.userId, now);
        const unsub = `${baseUrl}/api/email/unsubscribe?u=${s.userId}&t=${unsubscribeToken(s.userId)}`;
        const lines = [
          `This week: ${w.reviews} answers on ${w.studyDays} day${w.studyDays === 1 ? "" : "s"} (${w.minutes} min)${w.accuracy !== null ? `, ${w.accuracy}% correct` : ""}.`,
          `${w.newWords} new word${w.newWords === 1 ? "" : "s"}, ${w.writingSubmissions} writing submission${w.writingSubmissions === 1 ? "" : "s"}, ${w.examsSubmitted} practice exam${w.examsSubmitted === 1 ? "" : "s"}.`,
          ...(w.hardestWords.length ? [`Words to look at again: ${w.hardestWords.map((h) => h.headword).join(", ")}.`] : []),
        ];
        try {
          await sendEmail(email, "Your week in English Academy", `${lines.join("\n")}\n\nOpen: ${baseUrl}/progress\n\nUnsubscribe: ${unsub}`,
            `${lines.map((l) => `<p>${l.replace(/[<>&]/g, "")}</p>`).join("")}<p><a href="${baseUrl}/progress">See your progress</a></p><p style="color:#666;font-size:12px"><a href="${unsub}">Unsubscribe from e-mails</a></p>`, unsub);
          await finish(db, c.id, "sent");
          out.push({ userId: s.userId, channel: "weekly", status: "sent" });
        } catch (e) {
          await finish(db, c.id, "failed", e instanceof Error ? e.message : "error");
          out.push({ userId: s.userId, channel: "weekly", status: "failed" });
        }
      }
    }
    if (!s.pushEnabled && !s.emailEnabled) continue;
    if (!reminderDue(now, s)) continue;
    const counts = await dashboardCounts(db, s.userId, now);
    const due = counts.dueToday;
    if (due === 0 && counts.newAvailable === 0) continue;
    const localDate = localDateString(now, s.timezone);
    const title = due ? `${due} word${due === 1 ? "" : "s"} to review` : "New words are waiting";
    const body = due ? `About ${counts.estimatedMinutes} min. Keep your vocabulary fresh.` : `${counts.newAvailable} new words are ready when you are.`;
    if (s.pushEnabled && pushConfigured()) {
      const c = await claim(db, s.userId, "push", localDate);
      if (c) {
        try {
          const r = await sendPush(db, s.userId, { title, body, url: "/learn/session?mode=review" });
          await finish(db, c.id, r.delivered ? "sent" : "skipped", r.delivered ? undefined : "no_active_subscription");
          out.push({ userId: s.userId, channel: "push", status: r.delivered ? "sent" : "skipped" });
        } catch (e) {
          await finish(db, c.id, "failed", e instanceof Error ? e.message : "error");
          out.push({ userId: s.userId, channel: "push", status: "failed" });
        }
      }
    }
    if (s.emailEnabled && emailConfigured()) {
      const c = await claim(db, s.userId, "email", localDate);
      if (c) {
        const unsub = `${baseUrl}/api/email/unsubscribe?u=${s.userId}&t=${unsubscribeToken(s.userId)}`;
        const link = `${baseUrl}/learn/session?mode=review`;
        try {
          await sendEmail(email, title, `${body}\n\nStart: ${link}\n\nUnsubscribe: ${unsub}`,
            `<p>${body}</p><p><a href="${link}">Start reviewing</a></p><p style="color:#666;font-size:12px"><a href="${unsub}">Unsubscribe from reminder emails</a></p>`, unsub);
          await finish(db, c.id, "sent");
          out.push({ userId: s.userId, channel: "email", status: "sent" });
        } catch (e) {
          await finish(db, c.id, "failed", e instanceof Error ? e.message : "error");
          out.push({ userId: s.userId, channel: "email", status: "failed" });
        }
      }
    }
  }
  return out;
}
