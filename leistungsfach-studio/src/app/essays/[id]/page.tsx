import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentView, type AssessmentRow } from "@/components/assessment/AssessmentView";
import { EssayActions, TeacherFeedbackForm } from "@/components/assessment/EssayActions";
import { Badge, Card, CardTitle, cx, EmptyState, formatDate, MockBadge, PageHeader, ScoreRange } from "@/components/ui";
import { MODE_INFO, TASK_TYPES, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { getEssayDetail } from "@/server/services/essays";
import { getProfile } from "@/server/services/profile";
import { AppError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function EssayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string }> }) {
  const { id } = await params;
  const { a: selectedId } = await searchParams;
  let detail;
  try { detail = await getEssayDetail(id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  const profile = await getProfile();
  const { essay, assessments, revisions, exercises, teacher, children, parent } = detail;
  const selected = assessments.find((x) => x.id === selectedId) ?? assessments.find((x) => x.status === "completed") ?? assessments[0];
  const toRow = (x: (typeof assessments)[number]): AssessmentRow => ({ ...x, createdAt: x.createdAt.toISOString() });
  const t = TASK_TYPES[essay.taskType as TaskTypeKey];

  return (
    <>
      <PageHeader
        title={essay.title}
        intro={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{t?.label ?? essay.taskType}</Badge>
            {essay.operator && <Badge>Operator: {essay.operator}</Badge>}
            <Badge>{essay.wordCount} words</Badge>
            {essay.context === "exam_simulation" && <Badge tone="accent">Exam simulation{essay.timeUsedMinutes != null && essay.timeLimitMinutes ? ` · ${essay.timeUsedMinutes}/${essay.timeLimitMinutes} min` : ""}</Badge>}
            <span>{formatDate(essay.writtenAt ?? essay.createdAt)}</span>
          </span>
        }
      />
      {(parent || children.length > 0) && (
        <p className="-mt-3 mb-5 text-sm text-ink-2">
          {parent && <>Improved version of <Link className="text-accent underline" href={`/essays/${parent.id}`}>{parent.title}</Link>. </>}
          {children.length > 0 && <>Later versions: {children.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link className="text-accent underline" href={`/essays/${c.id}`}>{c.title}</Link></span>)}.</>}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {assessments.length > 1 && (
            <nav aria-label="Assessments of this essay" className="flex flex-wrap gap-2">
              {assessments.map((x) => (
                <Link key={x.id} href={`/essays/${id}?a=${x.id}`} aria-current={x.id === selected?.id ? "true" : undefined}
                  className={cx("rounded-lg border px-3 py-1.5 text-sm", x.id === selected?.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
                  {MODE_INFO[x.mode as AssessmentMode]?.label} · {x.status === "completed" ? <ScoreRange low={x.scoreLow} high={x.scoreHigh} size="sm" /> : <span className="text-bad">failed</span>} · {formatDate(x.createdAt)}
                </Link>
              ))}
            </nav>
          )}
          {selected ? <AssessmentView a={toRow(selected)} essayId={id} /> : (
            <EmptyState title="Not assessed yet">Choose a mode under “Next steps” and run the examiner.</EmptyState>
          )}

          <Card>
            <CardTitle>Your essay</CardTitle>
            <div className="prose-essay text-ink">{essay.essayText.split(/\n\s*\n|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
          </Card>
          <details className="rounded-xl border border-line bg-surface p-5">
            <summary className="cursor-pointer font-serif text-lg font-semibold">Task and material</summary>
            <div className="mt-3 space-y-3 text-sm text-ink-2">
              <p><span className="font-medium text-ink">Task: </span>{essay.taskPrompt || <em>not provided</em>}</p>
              {essay.rubricText && <p className="whitespace-pre-wrap"><span className="font-medium text-ink">Rubric: </span>{essay.rubricText}</p>}
              <div><p className="font-medium text-ink">Source text</p>{essay.sourceText ? <p className="mt-1 whitespace-pre-wrap font-serif">{essay.sourceText}</p> : <p><em>not provided</em></p>}</div>
            </div>
          </details>
        </div>

        <aside className="space-y-6">
          <EssayActions essayId={id} defaultMode={profile.defaultMode as AssessmentMode} />
          <Card>
            <CardTitle>Revisions</CardTitle>
            {revisions.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {revisions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    {r.status === "completed" ? <Link className="text-accent underline" href={`/revision/${r.id}`}>{r.depth} revision</Link> : <span className="text-bad">{r.depth} revision failed</span>}
                    <span className="flex items-center gap-1 text-xs text-muted"><MockBadge provider={r.provider} />{formatDate(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Exercises from this essay</CardTitle>
            {exercises.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {exercises.map((x) => <li key={x.id}><Link className="text-accent underline" href={`/training/${x.id}`}>{SKILLS[x.skillKey as SkillKey]?.label ?? x.skillKey}</Link> <span className="text-xs text-muted">· {x.type.replace(/_/g, " ")} · {x.status}</span></li>)}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Teacher feedback</CardTitle>
            {teacher.length === 0 ? <p className="text-sm text-muted">None entered.</p> : (
              <ul className="space-y-3 text-sm">
                {teacher.map((f) => (
                  <li key={f.id} className="rounded-lg bg-surface-2 p-3">
                    {f.teacherScore !== null && <p className="font-medium">Teacher&apos;s score: {f.teacherScore}/15</p>}
                    {f.comments && <p className="mt-1 whitespace-pre-wrap text-ink-2">{f.comments}</p>}
                    {selected?.status === "completed" && f.teacherScore !== null && selected.scoreLow !== null && (
                      <p className="mt-1 text-xs text-muted">Estimate {selected.scoreLow}–{selected.scoreHigh}: {f.teacherScore >= selected.scoreLow && f.teacherScore <= (selected.scoreHigh ?? 15) ? "teacher's mark falls within the range" : "teacher's mark falls outside the range"}.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <TeacherFeedbackForm essayId={id} />
        </aside>
      </div>
    </>
  );
}
