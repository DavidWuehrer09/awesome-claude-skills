"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/charts";
import { Card, Spinner, Tabs } from "@/components/ui";
import { api } from "@/lib/api";

type Week = { week: string; reviews: number; accuracy: number | null; minutes: number };
type Session = { id: string; mode: string; startedAt: string; endedAt: string | null; plannedMinutes: number | null; stats: Record<string, number>; topic: string | null };
type Summary = { reviews: number; reviewsBefore: number; accuracy: number | null; accuracyBefore: number | null; minutes: number; studyDays: number; newWords: number; writingSubmissions: number; examsSubmitted: number; hardestWords: { id: string; headword: string }[] };

const change = (now: number | null, before: number | null, unit = "") =>
  now === null || before === null || before === 0 ? "" : ` (${now >= before ? "+" : ""}${now - before}${unit} vs. week before)`;

/** Longer-term trends, the last seven days and the session history (loaded on the client). */
export function Trends() {
  const [weeks, setWeeks] = useState<"4" | "12" | "26">("12");
  const [data, setData] = useState<Week[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  useEffect(() => void api<{ weeks: Week[] }>(`/api/progress/trend?weeks=${weeks}`).then((r) => setData(r.weeks)), [weeks]);
  useEffect(() => {
    void api<{ summary: Summary }>("/api/planning").then((r) => setSummary(r.summary));
    void api<{ sessions: Session[] }>("/api/progress/sessions").then((r) => setSessions(r.sessions));
  }, []);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Answers per week</h2>
          <Tabs value={weeks} onChange={setWeeks} items={[{ value: "4", label: "4 weeks" }, { value: "12", label: "3 months" }, { value: "26", label: "6 months" }]} />
        </div>
        {!data ? <Spinner /> : (
          <>
            <BarChart label="Answers per week" data={data.map((w) => ({ key: w.week, label: w.week.slice(5), value: w.reviews, detail: `${w.minutes} min${w.accuracy !== null ? ` · ${w.accuracy}% correct` : ""}` }))} />
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-ink-2">Show as table</summary>
              <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-ink-3"><th className="font-medium">Week from</th><th className="text-right font-medium">Answers</th><th className="text-right font-medium">Correct</th><th className="text-right font-medium">Minutes</th></tr></thead>
                <tbody>{data.map((w) => <tr key={w.week}><td>{w.week}</td><td className="text-right tabular-nums">{w.reviews}</td><td className="text-right tabular-nums">{w.accuracy ?? "–"}{w.accuracy !== null ? "%" : ""}</td><td className="text-right tabular-nums">{w.minutes}</td></tr>)}</tbody></table>
            </details>
          </>
        )}
      </Card>
      <Card>
        <h2 className="text-lg">Last 7 days</h2>
        {!summary ? <Spinner /> : (
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            <li><strong className="text-ink">{summary.reviews}</strong> answers on {summary.studyDays} day{summary.studyDays === 1 ? "" : "s"}{change(summary.reviews, summary.reviewsBefore)}</li>
            {summary.accuracy !== null && <li><strong className="text-ink">{summary.accuracy}%</strong> correct{change(summary.accuracy, summary.accuracyBefore, " points")}</li>}
            <li>{summary.minutes} min · {summary.newWords} new words</li>
            <li>{summary.writingSubmissions} writing submission{summary.writingSubmissions === 1 ? "" : "s"} · {summary.examsSubmitted} practice exam{summary.examsSubmitted === 1 ? "" : "s"}</li>
            {summary.hardestWords.length > 0 && <li>Hardest this week: {summary.hardestWords.map((h) => h.headword).join(", ")} · <Link className="underline" href={`/learn/session?mode=practice&ids=${summary.hardestWords.map((h) => h.id).join(",")}`}>practise</Link></li>}
          </ul>
        )}
        <Link className="mt-4 inline-block text-sm underline" href="/progress/profile">Your learner profile</Link>
      </Card>
      <Card className="lg:col-span-3">
        <h2 className="text-lg">Session history</h2>
        {!sessions ? <Spinner /> : sessions.length === 0 ? <p className="mt-2 text-sm text-ink-2">No study sessions yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3"><th className="py-1.5 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Mode</th><th className="pr-3 font-medium">Topic</th><th className="pr-3 text-right font-medium">Answers · correct</th><th className="text-right font-medium">Minutes</th></tr></thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-3">{new Date(s.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="pr-3">{s.mode}</td>
                    <td className="pr-3 text-ink-2">{s.topic ?? "All"}</td>
                    <td className="pr-3 text-right tabular-nums">{s.stats.answered ?? "–"}{s.stats.accuracy !== undefined && s.stats.answered ? <span className="text-ink-3"> · {s.stats.accuracy}%</span> : null}</td>
                    <td className="text-right tabular-nums">{s.stats.minutes ?? (s.endedAt ? "–" : "unfinished")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
