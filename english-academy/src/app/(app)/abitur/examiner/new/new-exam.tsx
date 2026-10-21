"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL, type MaterialRow } from "@/components/examiner/shared";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { DIFFICULTIES, type Difficulty } from "@/domain/examiner/model";
import { api, ApiError, errorMessage } from "@/lib/api";

const DIFFICULTY_HELP: Record<Difficulty, string> = {
  consolidation: "Familiar material and clear tasks, to secure the basics.",
  realistic: "Like a normal Klausur in your course.",
  stretch: "Harder texts and more demanding operators.",
  abitur: "Abitur length and demand (based on assumptions unless you recorded verified official guidance).",
};

export function NewExam({ initialDifficulty }: { initialDifficulty: Difficulty }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [f, setF] = useState({
    topics: "", examType: "Klausur", difficulty: initialDifficulty, mode: "practice" as "practice" | "challenging" | "mock", durationMinutes: 90, taskCount: 3, targetWords: "",
    referenceExamIds: [] as string[], sourceMaterialIds: [] as string[], followReferenceClosely: "",
    includeVocabulary: true, focusWeaknesses: true, matchTeacherFormat: true, notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  useEffect(() => void api<{ materials: MaterialRow[] }>("/api/examiner/materials").then((r) => setMaterials(r.materials.filter((m) => m.usable))), []);
  const papers = materials.filter((m) => m.docType === "exam_paper");
  const sources = materials.filter((m) => m.docType === "source_text");
  const toggle = (key: "referenceExamIds" | "sourceMaterialIds", id: string) =>
    setF({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] });

  // Missing information is shown as labelled defaults before generating, not discovered afterwards.
  const assumptions = [
    ...(f.referenceExamIds.length ? [] : ["No previous exam selected: a general Bavarian upper-school format is used, not your teacher's."]),
    ...(f.topics.trim() ? [] : ["No topic given: the AI picks one from your vocabulary and weaknesses."]),
    ...(f.durationMinutes === 90 ? ["Time: 90 minutes (default)."] : []),
    ...(f.targetWords ? [] : ["Answer length: set per task by the AI to match the time."]),
  ];

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/examiner/exams", {
        method: "POST",
        json: {
          topics: f.topics.split(",").map((t) => t.trim()).filter(Boolean), examType: f.examType, difficulty: f.difficulty, mode: f.mode,
          durationMinutes: f.durationMinutes, taskCount: f.taskCount, targetWords: f.targetWords ? Number(f.targetWords) : null,
          referenceExamIds: f.referenceExamIds, sourceMaterialIds: f.sourceMaterialIds,
          followReferenceClosely: f.followReferenceClosely || null, includeVocabulary: f.includeVocabulary,
          focusWeaknesses: f.focusWeaknesses, matchTeacherFormat: f.matchTeacherFormat, notes: f.notes,
        },
      });
      router.push(`/abitur/examiner/exams/${r.id}`);
    } catch (e) {
      setError({ message: errorMessage(e), details: e instanceof ApiError && Array.isArray(e.details) ? (e.details as string[]) : [] });
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/abitur/examiner?tab=exams" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Exams</Link>
      <PageHeader title="New practice exam" subtitle="Describe the exam you want. It is written new for you: it can follow the format of your previous exams, but never copies their questions or texts." />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Topics" htmlFor="b-top" hint="Comma-separated, e.g. Globalisation, The American Dream"><Input id="b-top" value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} /></Field></div>
              <Field label="Exam type" htmlFor="b-type"><Input id="b-type" value={f.examType} onChange={(e) => setF({ ...f, examType: e.target.value })} /></Field>
              <Field label="Difficulty" htmlFor="b-diff" hint={DIFFICULTY_HELP[f.difficulty]}>
                <Select id="b-diff" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as Difficulty })}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}</Select>
              </Field>
              <Field label="Mode" htmlFor="b-mode" hint={{ practice: "Realistic tasks; you can pause and see your progress.", challenging: "Harder sources and stricter expectations than usual.", mock: "Full mock exam: timed, no pauses intended, marked strictly." }[f.mode]}>
                <Select id="b-mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as typeof f.mode })}>
                  <option value="practice">Practice</option><option value="challenging">Challenging</option><option value="mock">Mock exam</option>
                </Select>
              </Field>
              <Field label="Time (minutes)" htmlFor="b-min"><Input id="b-min" type="number" min={15} max={330} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} /></Field>
              <Field label="Number of tasks" htmlFor="b-n"><Input id="b-n" type="number" min={1} max={5} value={f.taskCount} onChange={(e) => setF({ ...f, taskCount: Number(e.target.value) })} /></Field>
              <Field label="Main task length in words (optional)" htmlFor="b-w"><Input id="b-w" type="number" min={50} max={1500} value={f.targetWords} onChange={(e) => setF({ ...f, targetWords: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="Anything else?" htmlFor="b-notes"><Textarea id="b-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. include a mediation task, a speech as source text" /></Field></div>
            </div>
          </Card>
          <Card>
            <h2 className="text-base font-semibold">Reference exams (format only)</h2>
            {papers.length === 0 ? <p className="mt-1 text-sm text-ink-2">No confirmed exam papers yet. <Link className="underline" href="/abitur/examiner?tab=materials">Upload one</Link> to match your teacher&apos;s format.</p> : (
              <ul className="mt-2 space-y-1.5">
                {papers.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={f.referenceExamIds.includes(m.id)} onChange={() => toggle("referenceExamIds", m.id)} /> <span className="truncate">{m.labels.title || m.filename}</span></label>
                    {f.referenceExamIds.includes(m.id) && (
                      <label className="flex items-center gap-1 text-xs text-ink-2"><input type="radio" name="follow" checked={f.followReferenceClosely === m.id} onChange={() => setF({ ...f, followReferenceClosely: m.id })} /> follow closely</label>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {sources.length > 0 && (
              <>
                <h2 className="mt-4 text-base font-semibold">Use one of your source texts</h2>
                <ul className="mt-2 space-y-1.5">{sources.map((m) => <li key={m.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sourceMaterialIds.includes(m.id)} onChange={() => toggle("sourceMaterialIds", m.id)} /> {m.labels.title || m.filename}</label></li>)}</ul>
              </>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <Toggle checked={f.matchTeacherFormat} onChange={(v) => setF({ ...f, matchTeacherFormat: v })} label="Match my course profile" description="Use the format and expectations in your profile." />
              <Toggle checked={f.focusWeaknesses} onChange={(v) => setF({ ...f, focusWeaknesses: v })} label="Target my weaknesses" description="Tasks that test your recurring problems." />
              <Toggle checked={f.includeVocabulary} onChange={(v) => setF({ ...f, includeVocabulary: v })} label="Use my vocabulary" description="Tasks where your current words fit naturally." />
            </div>
          </Card>
          {assumptions.length > 0 && (
            <Notice tone="warn" title="Assumptions for this exam">
              <ul className="list-disc pl-5">{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="mt-1">Change the fields above if any of these are wrong.</p>
            </Notice>
          )}
          {error && <Notice tone="danger" title={error.message}>{error.details.length > 0 && <ul className="list-disc pl-5">{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}</Notice>}
          <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={create}><Sparkles className="size-4" aria-hidden /> Create exam</Button>
          {busy && <p className="text-center text-xs text-ink-3">Writing and checking your exam. This can take a minute.</p>}
        </div>
      </div>
    </>
  );
}
