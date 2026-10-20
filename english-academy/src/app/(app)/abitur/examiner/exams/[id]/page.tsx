"use client";

import { ArrowLeft, Clock, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL } from "@/components/examiner/shared";
import { Badge, Button, Card, Notice, PageHeader, Spinner } from "@/components/ui";
import type { StudentExam } from "@/domain/examiner/model";
import { api, errorMessage } from "@/lib/api";

type Overview = {
  id: string; isDemo: boolean; createdAt: string; view: StudentExam; validation: { warnings: string[] };
  provenance: { notes: string; assumptions: string[]; formatBasedOn: number }; markingOrigin: string;
};
type ExamListRow = { id: string; attempts: { id: string; status: string; createdAt: string }[] };

export default function ExamOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [o, setO] = useState<Overview | null>(null);
  const [attempts, setAttempts] = useState<ExamListRow["attempts"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Overview>(`/api/examiner/exams/${id}`).then(setO).catch((e) => setError(errorMessage(e)));
    api<{ exams: ExamListRow[] }>("/api/examiner/exams").then((r) => setAttempts(r.exams.find((e) => e.id === id)?.attempts ?? []));
  }, [id]);

  const start = async (timed: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ attempt: { id: string } }>("/api/examiner/attempts", { method: "POST", json: { examId: id, timed } });
      router.push(`/abitur/examiner/attempt/${r.attempt.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this exam and all attempts and assessments for it?")) return;
    await api(`/api/examiner/exams/${id}`, { method: "DELETE" });
    router.push("/abitur/examiner?tab=exams");
  };

  if (error && !o) return <Notice tone="danger">{error}</Notice>;
  if (!o) return <Spinner />;
  const v = o.view;
  return (
    <>
      <Link href="/abitur/examiner?tab=exams" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Exams</Link>
      <PageHeader eyebrow={`${v.examType} · ${v.topic}`} title={v.title} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {o.isDemo && <Notice tone="warn" title="Demo exam">Built from a fixed pattern and a built-in fictional text, because no AI provider is configured. It does not reflect your course.</Notice>}
          <Card>
            <div className="flex flex-wrap gap-2">
              <Badge><Clock className="size-3" aria-hidden /> {v.durationMinutes} min</Badge>
              <Badge>{DIFFICULTY_LABEL[v.difficulty]}</Badge>
              <Badge>{v.tasks.length} task{v.tasks.length === 1 ? "" : "s"}</Badge>
              {v.totalPoints != null && <Badge tone="navy">{v.totalPoints} points · {v.markingLabel}</Badge>}
            </div>
            <p className="mt-3 text-sm text-ink-2">Task types: {v.tasks.map((t) => t.type.replace(/_/g, " ")).join(", ")}. The tasks and texts are shown when you start, as in a real exam.</p>
            {v.permittedResources.length > 0 && <p className="mt-2 text-sm">Allowed: {v.permittedResources.join(", ")}</p>}
          </Card>
          <Card>
            <h2 className="text-base font-semibold">How this exam was made</h2>
            <p className="mt-1 text-sm text-ink-2">{o.provenance.notes || "Original practice exam."}</p>
            {o.provenance.formatBasedOn > 0 && <p className="mt-1 text-sm">Format follows {o.provenance.formatBasedOn} of your previous exams.</p>}
            {o.provenance.assumptions.length > 0 && <><h3 className="mt-3 text-sm font-medium">Assumptions</h3><ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{o.provenance.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></>}
            {o.validation.warnings.length > 0 && <div className="mt-3"><Notice tone="warn" title="Checks"><ul className="list-disc pl-5">{o.validation.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice></div>}
            <p className="mt-3 text-xs text-ink-3">This is an original practice exam, not an official paper.</p>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">Start</h2>
            <p className="mt-1 text-sm text-ink-2">Exam conditions: a visible timer, no feedback until you submit. Your answers are saved continuously.</p>
            <Button variant="primary" className="mt-3 w-full" loading={busy} onClick={() => start(true)}><Play className="size-4" aria-hidden /> Start timed ({v.durationMinutes} min)</Button>
            <Button className="mt-2 w-full" disabled={busy} onClick={() => start(false)}>Start without time limit</Button>
          </Card>
          {attempts.length > 0 && (
            <Card>
              <h2 className="text-base font-semibold">Your attempts</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {attempts.map((a) => (
                  <li key={a.id}><Link className="underline" href={`/abitur/examiner/attempt/${a.id}`}>{new Date(a.createdAt).toLocaleString()}</Link> <Badge tone={a.status === "submitted" ? "sage" : "accent"}>{a.status === "submitted" ? "submitted" : "in progress"}</Badge></li>
                ))}
              </ul>
            </Card>
          )}
          <Button variant="danger" size="sm" onClick={remove}><Trash2 className="size-4" aria-hidden /> Delete exam</Button>
        </div>
      </div>
    </>
  );
}
