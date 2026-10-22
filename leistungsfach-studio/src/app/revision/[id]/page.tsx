import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionStudio } from "@/components/revision/RevisionStudio";
import { Badge, ErrorNotice, formatDate, MockBadge, PageHeader } from "@/components/ui";
import type { ExplanationOutput } from "@/lib/ai/schemas";
import { getRevisionView } from "@/server/services/revision";
import { AppError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let view;
  try { view = await getRevisionView(id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  const { revision, essay, doc, explanations } = view;
  return (
    <>
      <PageHeader
        title="Revision Studio"
        intro={<span className="flex flex-wrap items-center gap-2"><Link className="text-accent underline" href={`/essays/${essay.id}`}>{essay.title}</Link><Badge>{revision.depth} revision</Badge><MockBadge provider={revision.provider} /><span>{formatDate(revision.createdAt)}</span></span>}
      />
      {!doc ? <ErrorNotice title="This revision failed" message={revision.errorMessage ?? "Unknown error"} /> : (
        <RevisionStudio
          revisionId={id}
          initialDoc={doc}
          overview={revision.overview ?? ""}
          initialExplanations={explanations.map((e) => ({ id: e.id, editId: e.editId, question: e.question, result: e.result as ExplanationOutput, createdAt: e.createdAt.toISOString() }))}
        />
      )}
    </>
  );
}
