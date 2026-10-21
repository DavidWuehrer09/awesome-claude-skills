"use client";

import clsx from "clsx";
import { ArrowLeft, Check, CloudOff, History, Pause, Play, Send, Sparkles, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LabItemCard } from "@/components/examiner/lab-item";
import { SourceText } from "@/components/writing/source-text";
import { Badge, Button, Card, Input, Notice, Spinner, useToast } from "@/components/ui";
import type { Assessment } from "@/domain/examiner/model";
import { api, ApiError, errorMessage } from "@/lib/api";
import { inflectionPattern, wordCount } from "@/lib/text";

type Prompt = {
  id: string; section: string; taskType: string; title: string; instructions: string; sourceText: string | null; sourceLabel: string | null; answerKey: string | null;
  targetWords: string[]; timeLimitMinutes: number | null; minWords: number | null; maxWords: number | null; isDemo: boolean; origin: string;
};
type Draft = { id: string; title: string; body: string; version: number; elapsedSeconds: number; timerStartedAt: string | null; updatedAt: string };
type Sub = { id: string; versionNo: number; wordCount: number; createdAt: string; assessmentStatus: string | null };

type LabResult = { items: Assessment["lab"]; overall: string; demo: boolean };

/** The selected text, or the paragraph around the cursor when nothing is selected. */
function selectedPassage(body: string, start: number, end: number): string {
  if (end > start) return body.slice(start, end).trim();
  const from = body.lastIndexOf("\n", start - 1) + 1;
  const to = body.indexOf("\n", start);
  return body.slice(from, to === -1 ? body.length : to).trim();
}

const PASSES = ["Grammar and spelling", "Sentence structure", "Vocabulary and collocations", "Logical progression", "Precision and concision", "Overall argument quality"];

export function DraftEditor({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "offline" | "conflict">("saved");
  const [serverCopy, setServerCopy] = useState<Draft | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [passes, setPasses] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(1);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ body: "", title: "", elapsed: 0 });
  const LOCAL_KEY = `draft-backup:${id}`;

  const load = useCallback(() => api<{ draft: Draft; prompt: Prompt | null; submissions: Sub[] }>(`/api/writing/drafts/${id}`).then((r) => {
      let localBody = r.draft.body;
      try {
        const backup = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") as { body: string; version: number; at: number } | null;
        if (backup && backup.version === r.draft.version && backup.body !== r.draft.body) {
          localBody = backup.body; // unsynced local edits from an earlier offline session
          setSaveState("dirty");
        }
      } catch { /* storage unavailable */ }
      setDraft(r.draft);
      setPrompt(r.prompt);
      setSubs(r.submissions);
      setBody(localBody);
      setTitle(r.draft.title);
      setElapsed(r.draft.elapsedSeconds);
      version.current = r.draft.version;
    }).catch((e) => setError(errorMessage(e))), [id, LOCAL_KEY]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    latest.current = { body, title, elapsed };
  }, [body, title, elapsed]);

  /** Every edit is backed up locally at once and marked for the next autosave. */
  const editText = (next: { body?: string; title?: string }) => {
    if (next.body !== undefined) setBody(next.body);
    if (next.title !== undefined) setTitle(next.title);
    latest.current = { ...latest.current, ...next };
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ body: latest.current.body, version: version.current, at: Date.now() })); } catch { /* ignore */ }
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
  };

  const save = useCallback(async (force?: boolean) => {
    setSaveState("saving");
    try {
      const { draft: d } = await api<{ draft: Draft }>(`/api/writing/drafts/${id}`, {
        method: "PATCH",
        json: { body: latest.current.body, title: latest.current.title, elapsedSeconds: latest.current.elapsed, baseVersion: version.current, timerStarted: running || undefined },
      });
      version.current = d.version;
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
      setSaveState("saved");
      if (force) toast({ tone: "sage", text: "Saved" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setServerCopy((e.details as { server: Draft }).server);
        setSaveState("conflict");
      } else setSaveState(e instanceof ApiError && e.code === "offline" ? "offline" : "dirty");
    }
  }, [id, LOCAL_KEY, running, toast]);

  // Autosave to the server after a short pause in typing.
  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [body, title, saveState, save]);

  useEffect(() => {
    const online = () => saveState !== "saved" && saveState !== "conflict" && void save();
    window.addEventListener("online", online);
    const beforeUnload = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("online", online); window.removeEventListener("beforeunload", beforeUnload); };
  }, [save, saveState]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const words = wordCount(body);
  const limitSec = prompt?.timeLimitMinutes ? prompt.timeLimitMinutes * 60 : null;
  const remaining = limitSec !== null ? limitSec - elapsed : null;
  const targetUse = useMemo(() => (prompt?.targetWords ?? []).map((w) => ({ w, used: !!inflectionPattern(w)?.test(body) })), [prompt, body]);

  const resolveConflict = async (keep: "mine" | "server") => {
    if (!serverCopy) return;
    version.current = serverCopy.version;
    if (keep === "server") {
      setBody(serverCopy.body);
      setTitle(serverCopy.title);
      setSaveState("saved");
    } else {
      setSaveState("dirty");
      await save(true);
    }
    setServerCopy(null);
  };

  const submit = async () => {
    if (saveState !== "saved") await save();
    if (!confirm("Submit this version? It is stored unchanged; you can keep revising afterwards and compare versions.")) return;
    setSubmitting(true);
    try {
      setRunning(false);
      const { submission } = await api<{ submission: { id: string } }>(`/api/writing/drafts/${id}/submit`, { method: "POST" });
      router.push(`/writing/submission/${submission.id}`);
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
      setSubmitting(false);
    }
  };

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!draft) return <Spinner />;
  const fmt = (s: number) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/writing" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Writing Lab</Link>
        <div className="flex items-center gap-2 text-sm">
          <span className={clsx("inline-flex items-center gap-1", saveState === "saved" ? "text-sage" : saveState === "conflict" ? "text-danger" : "text-ink-3")} aria-live="polite">
            {saveState === "saved" ? <><Check className="size-4" aria-hidden /> Saved</> : saveState === "saving" ? "Saving…" : saveState === "offline" ? <><CloudOff className="size-4" aria-hidden /> Offline – kept on this device</> : saveState === "conflict" ? "Conflict" : "Unsaved changes"}
          </span>
          {subs.length > 0 && <Link href={`/writing/submission/${subs[subs.length - 1].id}`} className="inline-flex items-center gap-1 text-navy underline"><History className="size-4" aria-hidden /> {subs.length} version{subs.length > 1 ? "s" : ""}</Link>}
        </div>
      </div>

      {saveState === "conflict" && serverCopy && (
        <Notice tone="warn" title="This draft was changed on another device">
          Your version and the other version differ. <button className="underline" onClick={() => resolveConflict("mine")}>Keep mine</button> · <button className="underline" onClick={() => resolveConflict("server")}>Use the other version</button> ({wordCount(serverCopy.body)} words, saved {new Date(serverCopy.updatedAt).toLocaleTimeString()}).
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {prompt && <Badge tone="navy">{prompt.section.replace("_", " ")}</Badge>}
            {prompt?.timeLimitMinutes && <Badge><Timer className="size-3" aria-hidden /> {prompt.timeLimitMinutes} min</Badge>}
            {(prompt?.minWords || prompt?.maxWords) && <Badge>{prompt?.minWords ?? "?"}–{prompt?.maxWords ?? "?"} words</Badge>}
            {prompt?.isDemo && <Badge tone="warn">demo</Badge>}
          </div>
          <h1 className="mt-2 text-xl">{prompt?.title ?? draft.title}</h1>
          {prompt && <p className="mt-2 whitespace-pre-line text-ink-2">{prompt.instructions}</p>}
          {prompt?.sourceText && <div className="mt-4 border-t border-line pt-4"><SourceText text={prompt.sourceText} label={prompt.sourceLabel} /></div>}
          {targetUse.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-sm font-medium text-ink-2">Target vocabulary (only where it fits)</p>
              <div className="flex flex-wrap gap-1.5">{targetUse.map((t) => <Badge key={t.w} tone={t.used ? "sage" : "neutral"}>{t.used && <Check className="size-3" aria-hidden />}{t.w}</Badge>)}</div>
            </div>
          )}
          {prompt?.section === "editing" && (
            <fieldset className="mt-4 border-t border-line pt-3">
              <legend className="mb-2 text-sm font-medium text-ink-2">Proofreading passes</legend>
              {PASSES.map((p, i) => (
                <label key={p} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={passes.has(i)} onChange={() => setPasses((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="accent-[var(--navy)]" />
                  {i + 1}. {p}
                </label>
              ))}
            </fieldset>
          )}
        </Card>

        <div className="space-y-3">
          {!prompt && <Input aria-label="Title" value={title} onChange={(e) => editText({ title: e.target.value })} className="font-display text-lg" />}
          {limitSec !== null && (
            <div className={clsx("flex items-center justify-between rounded-lg px-4 py-2", remaining! <= 0 ? "bg-danger-soft text-danger" : remaining! < 300 ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>
              <span className="font-mono text-lg" role="timer" aria-live="off">{remaining! > 0 ? fmt(remaining!) : `Time is up (+${fmt(-remaining!)})`}</span>
              <span className="text-sm">{remaining! <= 0 ? "Your text is kept. Finish your sentence, then submit." : running ? "Timer running" : "Timer paused"}</span>
              <Button size="sm" onClick={() => setRunning((r) => !r)}>{running ? <><Pause className="size-4" aria-hidden /> Pause</> : <><Play className="size-4" aria-hidden /> {elapsed ? "Resume" : "Start timer"}</>}</Button>
            </div>
          )}
          <textarea
            ref={textRef}
            value={body}
            onChange={(e) => editText({ body: e.target.value })}
            aria-label="Your text"
            spellCheck={prompt?.section !== "editing"}
            placeholder={prompt?.section === "refinement" || prompt?.section === "editing" ? "Paste the paragraph from the left and revise it here…" : "Start writing…"}
            className="min-h-[55vh] w-full resize-y rounded-xl border border-line-strong bg-surface p-5 font-display text-[17px] leading-8 text-ink outline-none focus:border-navy"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={clsx("text-sm", prompt?.minWords && words < prompt.minWords ? "text-warn" : prompt?.maxWords && words > prompt.maxWords ? "text-warn" : "text-ink-3")}>
              {words} words{prompt?.minWords ? ` · target ${prompt.minWords}–${prompt.maxWords ?? "…"}` : ""}
            </span>
            <div className="flex gap-2">
              {(prompt?.section === "refinement" || prompt?.section === "editing") && prompt.sourceText && !body && <Button size="sm" onClick={() => editText({ body: prompt.sourceText! })}>Copy paragraph to edit</Button>}
              <Button onClick={() => save(true)} disabled={saveState === "saving"}>Save</Button>
              <Button variant="primary" onClick={submit} loading={submitting} disabled={words < 3}><Send className="size-4" aria-hidden /> Submit for feedback</Button>
            </div>
          </div>
          <p className="text-xs text-ink-3">Autosaves while you type. Submitting stores this version unchanged; revisions become new versions you can compare.</p>
          <SelectionFeedback textRef={textRef} prompt={prompt} />
        </div>
      </div>
    </div>
  );
}

/**
 * Targeted feedback on one passage while drafting, via the Improvement Lab
 * (/api/examiner/lab) with the task's source text as context and its task type.
 */
function SelectionFeedback({ textRef, prompt }: { textRef: React.RefObject<HTMLTextAreaElement | null>; prompt: Prompt | null }) {
  const toast = useToast();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [passage, setPassage] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);

  const run = async () => {
    const el = textRef.current;
    if (!el) return;
    const text = selectedPassage(el.value, el.selectionStart, el.selectionEnd);
    if (text.length < 10) {
      toast({ tone: "warn", text: "Select a sentence or paragraph first (or place the cursor in a paragraph)." });
      return;
    }
    setBusy(true);
    setResult(null);
    setPassage(text);
    try {
      setResult(await api<LabResult>("/api/examiner/lab", {
        method: "POST",
        json: { text: text.slice(0, 20_000), taskType: prompt?.taskType ?? null, context: prompt?.sourceText ?? null, focus: question.trim() || null },
      }));
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
      setPassage(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Feedback on selection</h2>
        <p className="text-sm text-ink-2">Select a sentence or paragraph in your text (or just place the cursor in a paragraph) and get targeted feedback on that passage only.</p>
      </div>
      <Input aria-label="Your question (optional)" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder="Optional question, e.g. Why is this construction weak?" />
      {/* preventDefault on mousedown keeps the textarea's selection when the button is pressed */}
      <Button onMouseDown={(e) => e.preventDefault()} onClick={run} loading={busy}><Sparkles className="size-4" aria-hidden /> Get feedback on this passage</Button>
      {passage && result && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-ink-3">Passage: <q className="text-ink-2">{passage.length > 160 ? `${passage.slice(0, 160)}…` : passage}</q></p>
            <Button size="sm" variant="ghost" aria-label="Close feedback" onClick={() => { setResult(null); setPassage(null); }}><X className="size-4" /></Button>
          </div>
          {result.demo ? <Notice tone="warn" title="Demo mode">{result.overall}</Notice> : result.overall && <Notice tone="accent">{result.overall}</Notice>}
          {result.items.map((item, i) => <LabItemCard key={i} item={item} />)}
          {!result.demo && !result.items.length && <p className="text-sm text-ink-3">No specific passage needed improvement.</p>}
          <p className="text-xs text-ink-3">AI feedback can be wrong. It counts towards your monthly exercise allowance.</p>
        </div>
      )}
    </Card>
  );
}
