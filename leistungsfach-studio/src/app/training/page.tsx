import Link from "next/link";
import { CustomExercise, StartButton, TYPE_LABEL } from "@/components/training/GenerateExercise";
import { Badge, Card, CardTitle, EmptyState, formatDate, MockBadge, PageHeader } from "@/components/ui";
import type { ExerciseType } from "@/lib/ai/schemas";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { duePatternReviews, getPriorities, listExercises } from "@/server/services/training";

export const metadata = { title: "Personal Training" };
export const dynamic = "force-dynamic";

const outcomeTone = { correct: "good", partial: "warn", incorrect: "bad" } as const;

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const [{ priorities, basedOn }, due, exercises] = await Promise.all([getPriorities(), duePatternReviews(), listExercises()]);
  return (
    <>
      <PageHeader title="Personal Training" intro="Short, targeted practice built from your own essays and recurring errors. A skill only counts as learned when you apply it yourself — reading a model answer does not change your profile." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle aside={basedOn && <span className="text-xs text-muted">Latest assessment: <Link className="underline" href={`/essays/${basedOn.essayId}`}>{basedOn.title}</Link></span>}>Your three most valuable priorities</CardTitle>
            {priorities.length === 0 ? (
              <EmptyState title="No priorities yet" action={<Link href="/examiner" className="font-medium text-accent underline">Assess an essay</Link>}>Priorities come from evidence in your own work. Assess an essay, or start a diagnostic exercise on the right.</EmptyState>
            ) : (
              <ol className="space-y-4">
                {priorities.map((p, i) => (
                  <li key={p.skillKey} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink"><span className="mr-2 text-muted">{i + 1}.</span>{p.label}</p>
                      <p className="mt-1 text-sm text-muted">Why: {p.reason}.</p>
                      <p className="mt-1 text-xs text-muted">Suggested: {TYPE_LABEL[p.suggestedType as ExerciseType]}</p>
                    </div>
                    <StartButton skillKey={p.skillKey} sourceEssayId={from ?? basedOn?.essayId ?? null} reason={`Priority ${i + 1}: ${p.reason}`} />
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardTitle>Due for review (spaced repetition)</CardTitle>
            {due.length === 0 ? <p className="text-sm text-muted">Nothing due. Recurring errors are scheduled for review automatically (after 1, 3, 7, 16, 35 days…).</p> : (
              <ul className="space-y-3">
                {due.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="font-medium text-ink">{p.label}</p><p className="text-xs text-muted">{SKILLS[p.skillKey as SkillKey]?.label} · {p.status}</p></div>
                    <StartButton skillKey={p.skillKey as SkillKey} errorPatternId={p.id} label="Review now" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Exercise history</CardTitle>
            {exercises.length === 0 ? <p className="text-sm text-muted">No exercises yet.</p> : (
              <ul className="divide-y divide-line">
                {exercises.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link className="font-medium text-ink underline decoration-line-strong underline-offset-2" href={`/training/${x.id}`}>{x.title}</Link>
                      <p className="text-xs text-muted">{SKILLS[x.skillKey as SkillKey]?.label} · {TYPE_LABEL[x.type as ExerciseType]} · {x.difficulty}{x.isTransfer ? " · transfer" : ""}</p>
                    </div>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <MockBadge provider={x.provider} />
                      {x.latestOutcome ? <Badge tone={outcomeTone[x.latestOutcome as keyof typeof outcomeTone]}>{x.latestOutcome}</Badge> : <Badge>{x.attemptCount ? "not evaluated" : "open"}</Badge>}
                      {formatDate(x.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <aside className="space-y-6">
          <CustomExercise sourceEssayId={from ?? null} />
          <Card>
            <CardTitle>How training adapts</CardTitle>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Two correct answers in a row → the next exercise is harder; two incorrect → easier.</li>
              <li>Model answers stay hidden until you have answered.</li>
              <li>Transfer exercises (new texts and topics) are needed before a skill can count as secure.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
