import { CalendarClock, Flame, PenLine, Target } from "lucide-react";
import Link from "next/link";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { daysUntil } from "@/lib/time";
import { requireUser } from "@/server/auth";
import { weeklyPlan } from "@/server/repos/planning";
import { dashboardCounts, progressReport, recommendations } from "@/server/repos/progress";
import { recentSubmissions } from "@/server/repos/writing";
import { Recommendations } from "./recommendations";
import { StartStudying } from "./start-studying";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const db = await getDb();
  const [counts, recs, report, writing, plan] = await Promise.all([
    dashboardCounts(db, user.id),
    recommendations(db, user.id),
    progressReport(db, user.id),
    recentSubmissions(db, user.id, 3),
    weeklyPlan(db, user.id),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: counts.settings.timezone }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weakestTopics = report.byTopic.filter((t) => t.words >= 3).sort((a, b) => a.mastery - b.mastery).slice(0, 3);
  const last7 = report.daily.slice(-7);
  const examDays = counts.settings.examDate ? daysUntil(counts.settings.examDate) : null;

  return (
    <>
      <PageHeader eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: counts.settings.timezone }).format(new Date())}
        title={`${greeting}${user.displayName ? `, ${user.displayName}` : ""}`}
        subtitle={counts.total === 0 ? "Your vocabulary is empty. Import a list or add your first word to begin." : undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg">Today</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Due today" value={counts.dueToday} />
            <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? "accent" : undefined} />
            <Stat label="New available" value={counts.newAvailable} />
            <Stat label="Est. time" value={`${counts.estimatedMinutes} min`} />
          </dl>
          <div className="mt-5">
            <StartStudying defaultMinutes={counts.settings.sessionMinutes} hasWork={counts.dueToday + counts.newAvailable > 0} empty={counts.total === 0} />
          </div>
          {counts.reviewedToday > 0 && <p className="mt-3 text-sm text-sage">{counts.reviewedToday} answers recorded today.</p>}
        </Card>

        <Card>
          <h2 className="text-lg">This week</h2>
          <div className="mt-4 flex h-20 items-end gap-1.5" role="img" aria-label={`Reviews per day: ${last7.map((d) => d.reviews).join(", ")}`}>
            {last7.map((d) => {
              const max = Math.max(1, ...last7.map((x) => x.reviews));
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-navy/80" style={{ height: `${Math.max(3, (d.reviews / max) * 64)}px`, opacity: d.reviews ? 1 : 0.2 }} title={`${d.date}: ${d.reviews}`} />
                  <span className="text-[10px] text-ink-3">{new Date(d.date).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 text-sm text-ink-2">
            <p>Study days this week: <strong className="text-ink">{plan.studyDays} of {plan.targetDays}</strong> <span className="text-ink-3">({plan.intensity} plan)</span></p>
            {report.streak !== null && report.streak > 0 && <p className="flex items-center gap-2"><Flame className="size-4 text-accent" aria-hidden /> {report.streak}-day study streak</p>}
            {examDays !== null && examDays >= 0 && <p className="flex items-center gap-2"><CalendarClock className="size-4 text-navy" aria-hidden /> Exam in {examDays} days</p>}
            {report.observed.independentAccuracy28d !== null && <p>Independent recall (28 days): <strong>{report.observed.independentAccuracy28d}%</strong></p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg">Recommended next</h2>
          <Recommendations initial={recs} />
        </Card>
        <div className="space-y-4">
          {(plan.targets.length > 0 || (examDays !== null && examDays >= 0)) && (
            <Card>
              <h2 className="flex items-center gap-2 text-lg"><Target className="size-4" aria-hidden /> Upcoming goals</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {examDays !== null && examDays >= 0 && <li>Exam in <strong>{examDays} days</strong>{plan.targets.length ? ": focus on your target topics." : ". Set target topics in Settings to focus your practice."}</li>}
                {plan.targets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/learn/session?mode=focused&topic=${t.id}`} className="block hover:text-navy">
                      <span className="flex justify-between gap-2"><span className="truncate">{t.name}</span><span className="shrink-0 text-ink-3">{t.productive}/{t.words} active</span></span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-sage" style={{ width: `${t.words ? (t.productive / t.words) * 100 : 0}%` }} /></span>
                      {(t.due > 0 || t.notStarted > 0) && <span className="mt-0.5 block text-xs text-ink-3">{t.due ? `${t.due} due` : ""}{t.due && t.notStarted ? " · " : ""}{t.notStarted ? `${t.notStarted} not started` : ""}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="text-lg">Weakest areas</h2>
            {weakestTopics.length ? (
              <ul className="mt-3 space-y-3">
                {weakestTopics.map((t) => (
                  <li key={t.id}>
                    <Link href={`/learn/session?mode=focused&topic=${t.id}`} className="flex items-center justify-between gap-3 text-sm hover:text-navy">
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 text-ink-3">{t.mastery}% mastery</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-3">Appears once topics have a few studied words.</p>}
          </Card>
          <Card>
            <h2 className="flex items-center gap-2 text-lg"><PenLine className="size-4" aria-hidden /> Recent writing</h2>
            {writing.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {writing.map((w) => (
                  <li key={w.id}>
                    <Link href={`/writing/submission/${w.id}`} className="flex justify-between gap-2 hover:text-navy">
                      <span className="truncate">{w.title} · v{w.versionNo}</span>
                      <span className="shrink-0 text-ink-3">{w.status === "complete" ? (w.isDemo ? "demo check" : "assessed") : w.status ?? "not assessed"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-ink-3">
                No submissions yet. <Link className="text-navy underline" href="/writing">Open the Writing Lab</Link>
              </div>
            )}
          </Card>
          {counts.total === 0 && (
            <Card>
              <h2 className="text-lg">Get started</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href="/vocabulary/import" variant="primary">Import a list</LinkButton>
                <LinkButton href="/vocabulary?add=1">Add a word</LinkButton>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "accent" }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className={`mt-1 font-display text-3xl ${tone === "accent" ? "text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
