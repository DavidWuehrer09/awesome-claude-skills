"use client";

import clsx from "clsx";
import { ArrowLeft, Check, CloudOff, FileCheck, Pause, Play, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SourceText } from "@/components/writing/source-text";
import { Badge, Button, Card, Notice, Select, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import type { Exam, StudentExam } from "@/domain/examiner/model";
import { api, ApiError, errorMessage } from "@/lib/api";
import { wordDiff } from "@/lib/diff";
import { wordCount } from "@/lib/text";

type Version = { id: string; n: number; kind: "submission" | "revision"; note: string | null; answers: Record<string, string>; wordCounts: Record<string, number>; createdAt: string };
type AttemptData = {
  attempt: { id: string; status: "in_progress" | "submitted"; timed: boolean; draft: Record<string, string>; draftVersion: number; timing: { elapsedSeconds?: number; pausedSeconds?: number; pauses?: number; overtimeSeconds?: number } };
  examId: string; isDemo: boolean; view: StudentExam; versions: Version[];
  assessments: { id: string; version: number; status: string; isDemo: boolean; error: string | null }[];
  expectations: Exam["hidden"]["taskExpectations"] | null;
};

export function AttemptPage({ id }: { id: string }) {
  const [data, setData] = useState<AttemptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<AttemptData>(`/api/examiner/attempts/${id}`).then(setData).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => void load(), [load]);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Spinner />;
  return data.attempt.status === "in_progress" ? <ExamRoom data={data} onSubmitted={load} /> : <Submitted data={data} reload={load} />;
}

const fmt = (s: number) => `${s < 0 ? "+" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

function lengthHint(t: StudentExam["tasks"][number], words: number) {
  const l = t.expectedLength;
  if (!l || l.unit !== "words") return null;
  const range = l.min && l.max ? `${l.min}–${l.max}` : l.max ? `up to ${l.max}` : `at least ${l.min}`;
  const off = (l.min && words < l.min * 0.9) || (l.max && words > l.max * 1.1);
  return <span className={clsx(off ? "text-warn" : "text-ink-3")}>{words} words · expected {range}</span>;
}

function Sources({ view }: { view: StudentExam }) {
  const [tab, setTab] = useState(view.sources[0]?.id ?? "");
  const s = view.sources.find((x) => x.id === tab);
  if (!view.sources.length) return null;
  return (
    <Card>
      {view.sources.length > 1 && <Tabs className="mb-3" value={tab} onChange={setTab} items={view.sources.map((x) => ({ value: x.id, label: x.title }))} />}
      {s && (
        <>
          <h2 className="font-display text-lg">{s.title}</h2>
          {s.citation && <p className="text-xs text-ink-3">{[s.citation.author, s.citation.publication, s.citation.date].filter(Boolean).join(", ")}{s.citation.adapted ? " (adapted)" : ""}</p>}
          <div className="mt-3 max-h-[70vh] overflow-y-auto pr-1"><SourceText text={s.text} label={s.label} /></div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- exam room

function ExamRoom({ data, onSubmitted }: { data: AttemptData; onSubmitted: () => void }) {
  const toast = useToast();
  const { view, attempt } = data;
  const KEY = `exam-backup:${attempt.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const b = JSON.parse(localStorage.getItem(KEY) ?? "null") as { answers: Record<string, string>; version: number } | null;
      if (b && b.version === attempt.draftVersion) return { ...attempt.draft, ...b.answers };
    } catch { /* storage unavailable */ }
    return attempt.draft;
  });
  const [elapsed, setElapsed] = useState(attempt.timing.elapsedSeconds ?? 0);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "offline" | "conflict">("saved");
  const [submitting, setSubmitting] = useState(false);
  const version = useRef(attempt.draftVersion);
  const latest = useRef({ answers, elapsed, pauses: attempt.timing.pauses ?? 0, pausedSeconds: attempt.timing.pausedSeconds ?? 0 });
  useEffect(() => {
    latest.current = { ...latest.current, answers, elapsed };
  }, [answers, elapsed]);

  useEffect(() => {
    const t = setInterval(() => {
      if (paused) latest.current.pausedSeconds++;
      else setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [paused]);

  const payload = () => {
    const limit = view.durationMinutes * 60;
    return {
      answers: latest.current.answers, baseVersion: version.current,
      timing: { elapsedSeconds: latest.current.elapsed, pauses: latest.current.pauses, pausedSeconds: latest.current.pausedSeconds, overtimeSeconds: attempt.timed ? Math.max(0, latest.current.elapsed - limit) : 0 },
    };
  };
  const save = useCallback(async () => {
    setState("saving");
    try {
      const r = await api<{ draftVersion: number }>(`/api/examiner/attempts/${attempt.id}`, { method: "PATCH", json: payload() });
      version.current = r.draftVersion;
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      setState("saved");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setState("conflict");
      else setState(e instanceof ApiError && e.code === "offline" ? "offline" : "dirty");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payload reads refs only
  }, [attempt.id, KEY]);

  useEffect(() => {
    if (state !== "dirty") return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [answers, state, save]);
  // Keep the timer on the server roughly current even without typing.
  useEffect(() => {
    const t = setInterval(() => setState((s) => (s === "saved" ? "dirty" : s)), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const online = () => setState((s) => (s === "offline" ? "dirty" : s));
    const leave = (e: BeforeUnloadEvent) => { if (state !== "saved") e.preventDefault(); };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("online", online); window.removeEventListener("beforeunload", leave); };
  }, [state]);

  const edit = (task: string, text: string) => {
    setAnswers((a) => {
      const next = { ...a, [task]: text };
      latest.current.answers = next;
      try { localStorage.setItem(KEY, JSON.stringify({ answers: next, version: version.current })); } catch { /* ignore */ }
      return next;
    });
    setState((s) => (s === "conflict" ? s : "dirty"));
  };
  const resolveConflict = async () => {
    // Keep this device's answers: adopt the server's version number, then save on top.
    const r = await api<AttemptData>(`/api/examiner/attempts/${attempt.id}`);
    version.current = r.attempt.draftVersion;
    await save();
  };
  const submit = async () => {
    const empty = view.tasks.filter((t) => !answers[t.number]?.trim()).map((t) => t.number);
    if (!confirm(`${empty.length ? `Task${empty.length > 1 ? "s" : ""} ${empty.join(", ")} ${empty.length > 1 ? "are" : "is"} empty. ` : ""}Submit your exam? The submitted answers are locked; you can revise afterwards as a new version.`)) return;
    setSubmitting(true);
    try {
      await api(`/api/examiner/attempts/${attempt.id}/submit`, { method: "POST", json: payload() });
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      toast({ tone: "sage", text: "Submitted" });
      onSubmitted();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
      if (e instanceof ApiError && e.status === 409) setState("conflict");
      setSubmitting(false);
    }
  };

  const remaining = view.durationMinutes * 60 - elapsed;
  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{view.title}</h1>
        {attempt.timed ? (
          <span className={clsx("rounded-md px-2 py-1 font-mono text-sm tabular-nums", remaining < 0 ? "bg-danger-soft text-danger" : remaining < 600 ? "bg-warn-soft text-warn" : "bg-surface-2")} role="timer" aria-label="Time remaining">
            {remaining >= 0 ? fmt(remaining) : `overtime ${fmt(-remaining)}`}
          </span>
        ) : <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-sm tabular-nums">{fmt(elapsed)}</span>}
        <Button size="sm" variant="ghost" aria-label={paused ? "Resume" : "Pause"} onClick={() => { if (!paused) latest.current.pauses++; setPaused(!paused); }}>
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
        </Button>
        <span className="text-xs text-ink-3" aria-live="polite">
          {state === "saved" ? <><Check className="inline size-3.5" aria-hidden /> saved</> : state === "saving" ? "saving…" : state === "offline" ? <><CloudOff className="inline size-3.5" aria-hidden /> offline, kept on this device</> : state === "conflict" ? "" : "unsaved"}
        </span>
        <Button size="sm" variant="primary" onClick={submit} loading={submitting}><Send className="size-4" aria-hidden /> Submit</Button>
      </div>
      {state === "conflict" && (
        <div className="mb-4"><Notice tone="warn" title="Saved on another device">This exam was changed elsewhere. <button className="underline" onClick={resolveConflict}>Keep the answers on this device</button> or <button className="underline" onClick={() => location.reload()}>load the other version</button>.</Notice></div>
      )}
      {paused && <div className="mb-4"><Notice>Paused. The pause is recorded with your attempt (it would not exist in a real exam).</Notice></div>}
      {data.isDemo && <div className="mb-4"><Notice tone="warn">Demo exam: generic tasks and a built-in fictional text.</Notice></div>}
      {view.generalInstructions && <p className="mb-4 text-sm text-ink-2">{view.generalInstructions}</p>}
      <div className={clsx("grid gap-4", view.sources.length && "lg:grid-cols-2")}>
        <div className="lg:sticky lg:top-16 lg:self-start"><Sources view={view} /></div>
        <div className="space-y-4">
          {view.tasks.map((t) => (
            <Card key={t.number}>
              <div className="flex items-start gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm text-navy-ink">{t.number}</span>
                <p className="min-w-0 flex-1 font-medium">{t.instruction}</p>
                {t.points != null && <Badge>{t.points} P</Badge>}
              </div>
              <Textarea aria-label={`Answer to task ${t.number}`} className="mt-3 min-h-[14rem]" spellCheck={false} value={answers[t.number] ?? ""} onChange={(e) => edit(t.number, e.target.value)} disabled={paused} />
              <div className="mt-1 flex justify-between text-xs">
                {lengthHint(t, wordCount(answers[t.number] ?? "")) ?? <span className="text-ink-3">{wordCount(answers[t.number] ?? "")} words</span>}
                {t.suggestedMinutes && <span className="text-ink-3">suggested {t.suggestedMinutes} min</span>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- after submission

function Submitted({ data, reload }: { data: AttemptData; reload: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { view, versions, assessments } = data;
  const [sel, setSel] = useState(versions[versions.length - 1]?.n ?? 1);
  const [compare, setCompare] = useState<number | null>(null);
  const [revising, setRevising] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const v = versions.find((x) => x.n === sel);
  const base = compare ? versions.find((x) => x.n === compare) : null;
  const asm = assessments.find((a) => a.version === sel);

  const assess = async () => {
    setBusy("assess");
    try {
      const r = await api<{ assessment: { id: string } }>(`/api/examiner/attempts/${data.attempt.id}/assess`, { method: "POST", json: { version: sel } });
      router.push(`/abitur/examiner/assessment/${r.assessment.id}`);
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
      reload();
      setBusy(null);
    }
  };
  const saveRevision = async () => {
    if (!revising) return;
    setBusy("revise");
    try {
      const r = await api<{ version: Version }>(`/api/examiner/attempts/${data.attempt.id}/revise`, { method: "POST", json: { answers: revising, note: "Revision" } });
      setRevising(null);
      setSel(r.version.n);
      reload();
      toast({ tone: "sage", text: `Saved as version ${r.version.n}` });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Link href={`/abitur/examiner/exams/${data.examId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Exam</Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-2xl">{view.title}</h1>
        <Badge tone="sage"><FileCheck className="size-3" aria-hidden /> submitted</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {revising ? (
            <>
              <Notice>Revise your answers. The original submission stays locked; this becomes a new version you can compare and have assessed.</Notice>
              {view.tasks.map((t) => (
                <Card key={t.number}>
                  <p className="font-medium">{t.number}. {t.instruction}</p>
                  <Textarea aria-label={`Revised answer to task ${t.number}`} className="mt-2 min-h-[12rem]" value={revising[t.number] ?? ""} onChange={(e) => setRevising({ ...revising, [t.number]: e.target.value })} />
                  <p className="mt-1 text-xs">{lengthHint(t, wordCount(revising[t.number] ?? ""))}</p>
                </Card>
              ))}
              <div className="flex gap-2"><Button variant="primary" loading={busy === "revise"} onClick={saveRevision}>Save as new version</Button><Button variant="ghost" onClick={() => setRevising(null)}>Cancel</Button></div>
            </>
          ) : v && view.tasks.map((t) => (
            <Card key={t.number}>
              <p className="font-medium">{t.number}. {t.instruction}</p>
              <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
                {base ? wordDiff(base.answers[t.number] ?? "", v.answers[t.number] ?? "").map((p, i) => (
                  <span key={i} className={p.type === "added" ? "bg-sage-soft text-sage" : p.type === "removed" ? "bg-danger-soft text-danger line-through" : undefined}>{p.text}</span>
                )) : (v.answers[t.number] || <span className="text-ink-3">No answer</span>)}
              </div>
              <p className="mt-1 text-xs">{lengthHint(t, v.wordCounts[t.number] ?? 0)}</p>
              {data.expectations && (
                <details className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">What was expected</summary>
                  {data.expectations.filter((e) => e.task === t.number).map((e) => (
                    <div key={e.task} className="mt-2 space-y-1">
                      <ul className="list-disc pl-5">{e.expectedContent.map((c) => <li key={c}>{c}</li>)}</ul>
                      {e.acceptableAlternatives.length > 0 && <p className="text-ink-2">Also acceptable: {e.acceptableAlternatives.join("; ")}</p>}
                      {e.commonPitfalls.length > 0 && <p className="text-ink-2">Common pitfalls: {e.commonPitfalls.join("; ")}</p>}
                    </div>
                  ))}
                </details>
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">Versions</h2>
            <Select aria-label="Version" className="mt-2" value={sel} onChange={(e) => { setSel(Number(e.target.value)); setCompare(null); }}>
              {versions.map((x) => <option key={x.n} value={x.n}>Version {x.n}: {x.kind === "submission" ? "submission (locked)" : x.note ?? "revision"}</option>)}
            </Select>
            {versions.length > 1 && (
              <Select aria-label="Compare with" className="mt-2" value={compare ?? ""} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Compare with…</option>
                {versions.filter((x) => x.n !== sel).map((x) => <option key={x.n} value={x.n}>Version {x.n}</option>)}
              </Select>
            )}
            {!revising && <Button className="mt-3 w-full" onClick={() => setRevising({ ...versions[versions.length - 1].answers })}>Revise answers</Button>}
          </Card>
          <Card>
            <h2 className="text-base font-semibold">Assessment of version {sel}</h2>
            {asm?.status === "complete" ? (
              <Link className="mt-2 inline-flex items-center gap-1 underline" href={`/abitur/examiner/assessment/${asm.id}`}>Open the report {asm.isDemo && <Badge tone="warn">demo</Badge>}</Link>
            ) : (
              <>
                {asm?.status === "failed" && <div className="mt-2"><Notice tone="danger">{asm.error ?? "The last attempt failed."}</Notice></div>}
                <p className="mt-1 text-sm text-ink-2">Teacher-style feedback, an indicative 0–15 estimate, an improvement lab and a model answer.</p>
                <Button variant="primary" className="mt-3 w-full" loading={busy === "assess"} onClick={assess}><Sparkles className="size-4" aria-hidden /> {asm?.status === "failed" ? "Try again" : "Get assessment"}</Button>
                {busy === "assess" && <p className="mt-1 text-xs text-ink-3">This can take a minute or two.</p>}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
