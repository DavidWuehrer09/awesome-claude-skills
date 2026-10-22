import Link from "next/link";
import { Legend } from "@/components/revision/RevisionStudio";
import { StartRevision } from "@/components/revision/StartRevision";
import { Card, CardTitle, EmptyState, formatDate, MockBadge, PageHeader } from "@/components/ui";
import { listEssays } from "@/server/services/essays";
import { listRevisions } from "@/server/services/revision";

export const metadata = { title: "Revision Studio" };
export const dynamic = "force-dynamic";

export default async function RevisionIndex() {
  const [revisions, essays] = await Promise.all([listRevisions(), listEssays()]);
  return (
    <>
      <PageHeader title="Revision Studio" intro="Compare your original with an improved version, sentence by sentence. Every change is classified and explained — what changed, why, the principle behind it, and how to apply it yourself." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardTitle>Your revisions</CardTitle>
          {revisions.length === 0 ? (
            <EmptyState title="No revisions yet">Choose an essay on the right. Revisions work best after an assessment, because the tutor then focuses on your most important priorities.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  {r.status === "completed" ? <Link className="font-medium text-ink underline decoration-line-strong underline-offset-2" href={`/revision/${r.id}`}>{r.title}</Link> : <span className="text-bad">{r.title} (failed)</span>}
                  <span className="flex items-center gap-2 text-sm text-muted">{r.depth}<MockBadge provider={r.provider} />{formatDate(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <StartRevision essays={essays.map((e) => ({ id: e.id, title: e.title, assessed: e.assessmentCount > 0 }))} />
          <Card><CardTitle>Colour key</CardTitle><Legend /><p className="mt-3 text-xs text-muted">Colours always come with a text label, and changed words show their previous wording on hover and to screen readers.</p></Card>
        </div>
      </div>
    </>
  );
}
