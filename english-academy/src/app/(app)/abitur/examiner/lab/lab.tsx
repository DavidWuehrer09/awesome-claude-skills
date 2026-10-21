"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LabItemCard } from "@/components/examiner/lab-item";
import { Button, Card, Field, Notice, PageHeader, Select, Textarea, useToast } from "@/components/ui";
import type { Assessment, StudentExam } from "@/domain/examiner/model";
import { api, errorMessage } from "@/lib/api";

type AttemptRow = { id: string; title: string; status: string };
type AttemptDetail = { view: StudentExam; versions: { n: number; answers: Record<string, string> }[] };
type Result = { items: Assessment["lab"]; overall: string; demo: boolean };

const TASK_TYPES = ["comment", "discussion", "non_fiction_analysis", "stylistic_analysis", "literary_analysis", "characterisation", "summary", "mediation", "comparison"];

export function ImprovementLab() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [taskType, setTaskType] = useState("");
  const [context, setContext] = useState("");
  const [focus, setFocus] = useState("");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => void api<{ attempts: AttemptRow[] }>("/api/examiner/attempts").then((r) => setAttempts(r.attempts.filter((a) => a.status === "submitted"))), []);

  /** Load the latest version of one task answer, plus that task's source text as context. */
  const loadAnswer = async (value: string) => {
    if (!value) return;
    const [attemptId, task] = value.split("|");
    const d = await api<AttemptDetail>(`/api/examiner/attempts/${attemptId}`);
    const latest = d.versions[d.versions.length - 1];
    const t = d.view.tasks.find((x) => x.number === task);
    setText(latest?.answers[task] ?? "");
    setTaskType(t?.type ?? "");
    setContext(d.view.sources.filter((s) => t?.sourceIds.includes(s.id)).map((s) => s.text).join("\n\n"));
  };
  const [taskChoices, setTaskChoices] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    Promise.all(attempts.slice(0, 10).map((a) => api<AttemptDetail>(`/api/examiner/attempts/${a.id}`).then((d) => d.view.tasks.map((t) => ({ value: `${a.id}|${t.number}`, label: `${a.title} – task ${t.number}` })))))
      .then((lists) => setTaskChoices(lists.flat()))
      .catch(() => setTaskChoices([]));
  }, [attempts]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api<Result>("/api/examiner/lab", { method: "POST", json: { text, taskType: taskType || null, context: context || null, focus: focus || null } }));
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/abitur/examiner" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> My English Examiner</Link>
      <PageHeader title="15-Point Improvement Lab" subtitle="Paste a sentence, a paragraph or a whole answer. You get the passages that matter most at three levels – correct, stronger, high-level – with why each works and a short exercise." />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <Field label="Your text" htmlFor="lab-text"><Textarea id="lab-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your sentence or paragraph here…" /></Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Task type (optional)" htmlFor="lab-type">
              <Select id="lab-type" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option value="">Not specified</option>
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
            <Field label="What should improve? (optional)" htmlFor="lab-focus"><Textarea id="lab-focus" rows={1} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. my second sentence, transitions" /></Field>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-2">Add the source text (so content can be checked)</summary>
            <Textarea aria-label="Source text" className="mt-2" rows={5} value={context} onChange={(e) => setContext(e.target.value)} />
          </details>
          <Button variant="primary" className="mt-4" loading={busy} disabled={text.trim().length < 10} onClick={run}><Sparkles className="size-4" aria-hidden /> Improve</Button>
        </Card>
        <Card className="h-fit">
          <h2 className="text-base font-semibold">Use one of your exam answers</h2>
          {taskChoices.length ? (
            <Select aria-label="Exam answer" className="mt-2" defaultValue="" onChange={(e) => void loadAnswer(e.target.value)}>
              <option value="">Choose…</option>
              {taskChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          ) : <p className="mt-1 text-sm text-ink-2">Submitted exam answers appear here.</p>}
          <p className="mt-3 text-xs text-ink-3">Improvements keep your meaning. A higher level is not always better: the explanation says when a simpler version is the right choice.</p>
        </Card>
      </div>
      {result && (
        <div className="mt-6 space-y-4">
          {result.demo && <Notice tone="warn">{result.overall}</Notice>}
          {!result.demo && result.overall && <Notice tone="accent">{result.overall}</Notice>}
          {result.items.map((item, i) => <LabItemCard key={i} item={item} />)}
        </div>
      )}
    </>
  );
}
