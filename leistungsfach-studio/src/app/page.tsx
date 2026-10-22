import Link from "next/link";
import { DimensionBars } from "@/components/charts/DimensionBars";
import { ScoreTimeline, type TimelinePoint } from "@/components/charts/ScoreTimeline";
import { ProgressReviewCard } from "@/components/ProgressReviewCard";
import { StartButton } from "@/components/training/GenerateExercise";
import { Badge, Card, CardTitle, Notice, PageHeader, ScoreRange } from "@/components/ui";
import type { ProgressReviewOutput } from "@/lib/ai/schemas";
import { MODE_INFO, TASK_TYPES } from "@/lib/curriculum";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { getDashboard } from "@/server/services/progress";
import { getProfile } from "@/server/services/profile";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const [d, profile] = await Promise.all([getDashboard(), getProfile()]);
  const greeting = profile.displayName ? `Welcome back, ${profile.displayName}` : "Dashboard";
  const newEssay = <Link href="/examiner" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink">New essay</Link>;

  if (d.essayCount === 0) {
    return (
      <>
        <PageHeader title={greeting} intro="Your personal training studio for the English Leistungsfach. Everything here is built from your own work — there is no data yet." actions={newEssay} />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["1 · Submit an essay", "Paste the task, the source text and your essay into the Essay Examiner. Choose supportive, teacher-standard or strict mode.", "/examiner"],
            ["2 · Revise and understand", "Open the Revision Studio to compare your text with an improved version — every change is explained.", "/revision"],
            ["3 · Train your priorities", "Targeted exercises on your three most valuable skills, with spaced review of recurring errors.", "/training"],
          ].map(([t, b, href]) => (
            <Card key={t}><CardTitle>{t}</CardTitle><p className="text-sm leading-relaxed text-ink-2">{b}</p><Link href={href} className="mt-3 inline-block text-sm font-medium text-accent underline">Open</Link></Card>
          ))}
        </div>
        <div className="mt-6"><Notice>Tip: add your teacher&apos;s marks and comments to assessed essays. After three, the teacher-standard mode can be calibrated to your teacher (kept separate from official rules).</Notice></div>
      </>
    );
  }

  const points: TimelinePoint[] = d.timeline.map((t) => ({
    assessmentId: t.assessmentId, essayId: t.essayId, title: t.title, taskLabel: TASK_TYPES[t.taskType]?.label ?? t.taskType,
    modeLabel: MODE_INFO[t.mode]?.label ?? t.mode, date: t.date, low: t.low, high: t.high, best: t.best, confidence: t.confidence, mock: t.provider === "mock",
  }));
  const latest = d.timeline[d.timeline.length - 1];
  const exPct = d.exercises.evaluated ? Math.round((d.exercises.correct / d.exercises.evaluated) * 100) : null;

  return (
    <>
      <PageHeader title={greeting} intro="Your progress, built only from your own submissions and exercises." actions={newEssay} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Essays assessed" value={new Set(d.timeline.map((t) => t.essayId)).size} sub={`${d.essayCount} submitted`} />
        <Stat label="Latest estimate" value={latest ? <ScoreRange low={latest.low} high={latest.high} /> : "—"} sub={latest ? `${MODE_INFO[latest.mode]?.label} · ${TASK_TYPES[latest.taskType]?.label}` : "no completed assessment"} />
        <Stat label="Exercises" value={d.exercises.evaluated} sub={exPct !== null ? `${exPct}% fully correct · ${d.exercises.transfer} transfer` : "none evaluated yet"} />
        <Stat label="Vocabulary" value={`${d.vocab.learned}/${d.vocab.total}`} sub={`used correctly · ${d.vocab.due} due for review`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Score estimates over time</CardTitle>
            {points.length === 0 ? <p className="text-sm text-muted">No completed assessments yet.</p> : <ScoreTimeline points={points} />}
            {d.latestPairCaveats.length > 0 && (
              <div className="mt-3"><Notice tone="warn"><p className="font-medium">Comparing your last two assessments</p><ul className="mt-1 list-disc pl-4">{d.latestPairCaveats.map((c) => <li key={c}>{c}</li>)}</ul></Notice></div>
            )}
          </Card>
          {d.dimensions.length > 0 && <Card><CardTitle>Performance by criterion</CardTitle><DimensionBars data={d.dimensions} /></Card>}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardTitle>Improving</CardTitle>
              {d.improving.length === 0 ? <p className="text-sm text-muted">No skill shows a reliable upward trend yet — trends need at least four pieces of evidence.</p> : (
                <ul className="space-y-2 text-sm">{d.improving.map((s) => <li key={s.key} className="flex justify-between gap-2"><span>{s.label}</span><span className="tabular-nums text-muted">{s.level?.toFixed(1)}</span></li>)}</ul>
              )}
            </Card>
            <Card>
              <CardTitle>Needs attention</CardTitle>
              {d.attention.length === 0 ? <p className="text-sm text-muted">Nothing flagged.</p> : (
                <ul className="space-y-2 text-sm">{d.attention.map((s) => <li key={s.key} className="flex flex-wrap justify-between gap-2"><span>{s.label}</span><Badge tone={s.masteryStatus === "recurring_weakness" ? "bad" : "warn"}>{s.masteryLabel}</Badge></li>)}</ul>
              )}
            </Card>
          </div>
          <Card>
            <CardTitle aside={<Link className="text-sm text-accent underline" href="/profile?tab=patterns">All patterns</Link>}>Recurring errors</CardTitle>
            {d.recurring.length === 0 ? <p className="text-sm text-muted">No recurring error patterns. A mistake becomes “recurring” only when it appears in two different pieces of your work.</p> : (
              <ul className="space-y-2 text-sm">{d.recurring.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-ink">{r.label}</span><span className="flex items-center gap-2 text-xs text-muted">{r.submissions} pieces of work<Badge tone={r.status === "recurring" ? "bad" : "accent"}>{r.status}</Badge></span></li>)}</ul>
            )}
          </Card>
          {d.examSimulations.length > 0 && (
            <Card>
              <CardTitle>Exam simulations</CardTitle>
              <ul className="space-y-2 text-sm">{d.examSimulations.map((e) => (
                <li key={e.essayId} className="flex flex-wrap justify-between gap-2"><Link className="text-accent underline" href={`/essays/${e.essayId}`}>{e.title}</Link><span className="text-muted">{e.timeUsedMinutes ?? "?"}/{e.timeLimitMinutes ?? "?"} min · {e.low !== null ? `${e.low}–${e.high}/15` : "not assessed"}</span></li>
              ))}</ul>
            </Card>
          )}
          <ProgressReviewCard latest={d.latestReview ? { result: d.latestReview.result as ProgressReviewOutput, createdAt: d.latestReview.createdAt.toISOString(), provider: d.latestReview.provider } : null} />
        </div>
        <aside className="space-y-6">
          <Card>
            <CardTitle>Recommended next steps</CardTitle>
            {d.priorities.priorities.length === 0 ? <p className="text-sm text-muted">Assess an essay to get personal priorities.</p> : (
              <ol className="space-y-4">{d.priorities.priorities.map((p, i) => (
                <li key={p.skillKey}>
                  <p className="font-medium text-ink">{i + 1}. {SKILLS[p.skillKey as SkillKey].label}</p>
                  <p className="mb-2 text-xs text-muted">{p.reason}</p>
                  <StartButton skillKey={p.skillKey as SkillKey} sourceEssayId={d.priorities.basedOn?.essayId ?? null} reason={p.reason} />
                </li>
              ))}</ol>
            )}
          </Card>
          <Card>
            <CardTitle>Due today</CardTitle>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>Error-pattern reviews</span><Link className="text-accent underline" href="/training">{d.duePatterns.length}</Link></li>
              <li className="flex justify-between"><span>Vocabulary reviews</span><Link className="text-accent underline" href="/vocabulary">{d.vocab.due}</Link></li>
              {d.unanalysedTeacherFeedback > 0 && <li className="flex justify-between"><span>Teacher feedback to analyse</span><Link className="text-accent underline" href="/profile?tab=teacher">{d.unanalysedTeacherFeedback}</Link></li>}
            </ul>
          </Card>
          <Card>
            <CardTitle>Exercise results</CardTitle>
            {d.exercises.evaluated === 0 ? <p className="text-sm text-muted">No exercises evaluated yet.</p> : (
              <>
                <p className="text-sm text-ink-2"><span className="text-good">{d.exercises.correct} correct</span> · <span className="text-warn">{d.exercises.partial} partial</span> · <span className="text-bad">{d.exercises.incorrect} incorrect</span></p>
                <ul className="mt-2 space-y-1 text-xs text-muted">{d.exercises.bySkill.map((s) => <li key={s.skillKey} className="flex justify-between"><span>{s.label}</span><span className="tabular-nums">{s.correct}/{s.n}</span></li>)}</ul>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
