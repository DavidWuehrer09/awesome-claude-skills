import Link from "next/link";
import { Badge, EmptyState, formatDate, MockBadge, PageHeader, ScoreRange } from "@/components/ui";
import { MODE_INFO, TASK_TYPES, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import { listEssays } from "@/server/services/essays";

export const metadata = { title: "Essay History" };
export const dynamic = "force-dynamic";

export default async function EssaysPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const all = await listEssays();
  const essays = type ? all.filter((e) => e.taskType === type) : all;
  const types = [...new Set(all.map((e) => e.taskType))] as TaskTypeKey[];
  return (
    <>
      <PageHeader title="Essay History" intro="Every essay you submitted, with its assessments, revisions, teacher feedback and later versions." actions={<Link href="/examiner" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink">New essay</Link>} />
      {all.length === 0 ? (
        <EmptyState title="No essays yet" action={<Link href="/examiner" className="font-medium text-accent underline">Submit your first essay</Link>}>Your essays appear here once you submit them in the Essay Examiner.</EmptyState>
      ) : (
        <>
          {types.length > 1 && (
            <nav aria-label="Filter by task type" className="mb-4 flex flex-wrap gap-2 text-sm">
              <Link href="/essays" className={!type ? "font-semibold text-accent underline" : "text-ink-2 underline"}>All ({all.length})</Link>
              {types.map((t) => <Link key={t} href={`/essays?type=${t}`} className={type === t ? "font-semibold text-accent underline" : "text-ink-2 underline"}>{TASK_TYPES[t].label}</Link>)}
            </nav>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-3 font-medium">Essay</th><th className="px-4 py-3 font-medium">Task type</th><th className="px-4 py-3 font-medium">Latest estimate</th><th className="px-4 py-3 font-medium">Teacher</th><th className="px-4 py-3 font-medium">Date</th></tr>
              </thead>
              <tbody>
                {essays.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <Link href={`/essays/${e.id}`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent">{e.title}</Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {e.context === "exam_simulation" && <Badge tone="accent">Exam simulation</Badge>}
                        {e.parentEssayId && <Badge>Revised version</Badge>}
                        {e.revisionCount > 0 && <Badge>{e.revisionCount} revision{e.revisionCount > 1 ? "s" : ""}</Badge>}
                        <span className="text-xs text-muted">{e.wordCount} words</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{TASK_TYPES[e.taskType as TaskTypeKey]?.label ?? e.taskType}</td>
                    <td className="px-4 py-3">
                      {e.latestAssessment ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <ScoreRange low={e.latestAssessment.scoreLow} high={e.latestAssessment.scoreHigh} size="sm" />
                          <span className="text-xs text-muted">{MODE_INFO[e.latestAssessment.mode as AssessmentMode]?.label}</span>
                          <MockBadge provider={e.latestAssessment.provider} />
                        </div>
                      ) : <span className="text-muted">Not assessed</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{e.teacherScore ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-ink-2">{formatDate(e.writtenAt ?? e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
