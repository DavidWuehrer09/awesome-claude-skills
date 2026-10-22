"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MODE_INFO, MODES, TASK_TYPES, TASK_TYPE_KEYS, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import { wordCount } from "@/lib/text/normalize";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { aimFor15 } from "@/lib/client/aimFor15";
import { Badge, Button, Card, CardTitle, cx, ErrorNotice, Field, Input, LoadingNotice, Notice, ProvenanceBadge, Select, Textarea } from "@/components/ui";

const DRAFT_KEY = "studio.examiner.draft.v1";
const CONTEXTS = [
  { value: "practice", label: "Practice" },
  { value: "homework", label: "Homework" },
  { value: "classwork", label: "Classwork / Klausur (written earlier)" },
  { value: "exam_simulation", label: "Exam simulation (timed, here)" },
] as const;

type Draft = {
  title: string; taskType: TaskTypeKey; operator: string; taskPrompt: string; sourceText: string; essayText: string;
  rubricText: string; context: (typeof CONTEXTS)[number]["value"]; timeLimitMinutes: string; timeUsedMinutes: string; writtenAt: string;
};

const subscribeNoop = () => () => {};
function readDraft(): string | null {
  try { return localStorage.getItem(DRAFT_KEY); } catch { return null; }
}

const EMPTY: Draft = { title: "", taskType: "nonfiction_analysis", operator: "", taskPrompt: "", sourceText: "", essayText: "", rubricText: "", context: "practice", timeLimitMinutes: "", timeUsedMinutes: "", writtenAt: "" };

export type ParentEssay = { id: string; title: string; taskType: string; operator: string; taskPrompt: string; sourceText: string; rubricText: string; essayText: string } | null;

export function EssayForm({ defaultMode, parent }: { defaultMode: AssessmentMode; parent: ParentEssay }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() =>
    parent
      ? { ...EMPTY, title: `${parent.title} (revised)`, taskType: parent.taskType as TaskTypeKey, operator: parent.operator, taskPrompt: parent.taskPrompt, sourceText: parent.sourceText, rubricText: parent.rubricText, essayText: parent.essayText }
      : EMPTY,
  );
  const [mode, setMode] = useState<AssessmentMode>(defaultMode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "assessing" | "revising">("idle");
  const [failure, setFailure] = useState<{ message: string; essayId?: string } | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // A draft saved in this browser (never sent anywhere) is offered for restoring, not applied silently.
  const savedDraft = useSyncExternalStore(subscribeNoop, readDraft, () => null);
  const offerDraft = !parent && !touched && !draftDismissed && savedDraft !== null;

  useEffect(() => {
    if (parent || !touched) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ } }, 400);
    return () => clearTimeout(t);
  }, [d, parent, touched]);

  useEffect(() => {
    if (timerStart === null) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [timerStart]);

  const words = useMemo(() => wordCount(d.essayText), [d.essayText]);
  const sourceWords = useMemo(() => wordCount(d.sourceText), [d.sourceText]);
  const t = TASK_TYPES[d.taskType];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setTouched(true); setD((x) => ({ ...x, [k]: v })); };
  const limit = Number(d.timeLimitMinutes) || 0;
  const elapsedMin = timerStart ? (now - timerStart) / 60000 : 0;
  const remaining = limit ? Math.max(0, limit - elapsedMin) : 0;
  const busy = phase !== "idle";

  const missingWarnings = [
    !d.taskPrompt.trim() && "No task prompt: the estimate will have low confidence.",
    t.needsSourceText && !d.sourceText.trim() && "This task type normally needs the source text: without it, the examiner cannot check your understanding or quotations.",
  ].filter(Boolean) as string[];

  async function submit(assess: boolean | "aim15") {
    setFailure(null); setErrors({});
    const timeUsed = d.context === "exam_simulation" && timerStart ? Math.round(elapsedMin) : d.timeUsedMinutes ? Number(d.timeUsedMinutes) : null;
    const body = {
      title: d.title, taskType: d.taskType, operator: d.operator, taskPrompt: d.taskPrompt, sourceText: d.sourceText, essayText: d.essayText,
      rubricText: d.rubricText, context: d.context, timeLimitMinutes: limit || null, timeUsedMinutes: timeUsed, parentEssayId: parent?.id ?? null,
      writtenAt: d.writtenAt ? new Date(d.writtenAt).toISOString() : null,
    };
    setPhase("saving");
    let essayId: string;
    try {
      const essay = await api<{ id: string }>("/api/essays", { body });
      essayId = essay.id;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError && err.code === "invalid_input" && err.details) {
        const fe = err.details as Record<string, string[]>;
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])));
        setFailure({ message: "Please fix the highlighted fields." });
      } else setFailure({ message: errorMessage(err) });
      return;
    }
    if (!assess) { router.push(`/essays/${essayId}`); return; }
    if (assess === "aim15") {
      try {
        const revId = await aimFor15(essayId, (step) => setPhase(step));
        router.push(`/revision/${revId}`);
      } catch (err) {
        setPhase("idle");
        setFailure({ message: `Your essay was saved, but “Aim for 15” did not finish: ${errorMessage(err)}`, essayId });
      }
      return;
    }
    setPhase("assessing");
    try {
      await api(`/api/essays/${essayId}/assess`, { body: { mode } });
      router.push(`/essays/${essayId}?assessed=1`);
    } catch (err) {
      setPhase("idle");
      setFailure({ message: `Your essay was saved, but the assessment failed: ${errorMessage(err)}`, essayId });
    }
  }

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={(e) => { e.preventDefault(); submit(true); }} aria-describedby="form-status">
      <div className="space-y-6">
        {offerDraft && (
          <Notice tone="accent">
            You have an unsent draft from an earlier visit (stored only in this browser).{" "}
            <button type="button" className="underline" onClick={() => { try { setD({ ...EMPTY, ...JSON.parse(savedDraft!) }); } catch { /* corrupt draft */ } setTouched(true); }}>Restore it</button>{" · "}
            <button type="button" className="underline" onClick={() => { setDraftDismissed(true); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }}>Discard</button>
          </Notice>
        )}
        {parent && <Notice tone="accent">You are resubmitting an improved version of <strong>{parent.title}</strong>. Sentences copied unchanged from an AI revision will not count as evidence of your own skills.</Notice>}

        <Card>
          <CardTitle>1 · The task</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="title" error={errors.title}>
              <Input id="title" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Speech on climate protests – analysis" required />
            </Field>
            <Field label="Task type" htmlFor="taskType">
              <Select id="taskType" value={d.taskType} onChange={(e) => set("taskType", e.target.value as TaskTypeKey)}>
                {TASK_TYPE_KEYS.map((k) => <option key={k} value={k}>{TASK_TYPES[k].label}</option>)}
              </Select>
            </Field>
            <Field label="Operator" htmlFor="operator" optional hint={`Typical: ${t.operators.join(", ")}`}>
              <Input id="operator" value={d.operator} onChange={(e) => set("operator", e.target.value)} placeholder={t.operators[0]} />
            </Field>
            <Field label="Context" htmlFor="context">
              <Select id="context" value={d.context} onChange={(e) => set("context", e.target.value as Draft["context"])}>
                {CONTEXTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
            <div className="mb-1 flex flex-wrap items-center gap-2"><span className="font-medium text-ink">What “{t.guide.operator}” demands</span><ProvenanceBadge p={t.guide.provenance} /></div>
            <p>{t.guide.demands}</p>
            <p className="mt-1"><span className="font-medium">Typical pitfall:</span> {t.guide.pitfall}</p>
          </div>
          <div className="mt-4">
            <Field label="Task prompt (exact wording)" htmlFor="taskPrompt" error={errors.taskPrompt} hint="Copy the task as it was set. The examiner checks operator fulfilment against it.">
              <Textarea id="taskPrompt" rows={3} value={d.taskPrompt} onChange={(e) => set("taskPrompt", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle aside={<span className="text-xs text-muted">{sourceWords} words</span>}>2 · Source text or material</CardTitle>
          <Field label="Source text" htmlFor="sourceText" optional={!t.needsSourceText} hint="Paste the text you worked on, ideally with line numbers. Quotations in your essay are checked against it." error={errors.sourceText}>
            <Textarea id="sourceText" rows={8} value={d.sourceText} onChange={(e) => set("sourceText", e.target.value)} className="font-serif" />
          </Field>
        </Card>

        <Card>
          <CardTitle aside={<span className="text-sm tabular-nums text-muted" aria-live="polite">{words} words</span>}>3 · Your essay</CardTitle>
          {d.context === "exam_simulation" && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-2 p-3">
              <Field label="Time limit (minutes)" htmlFor="timeLimit" hint="Abitur eA reportedly gives 285 min for writing + mediation together (unverified).">
                <Input id="timeLimit" type="number" min={5} max={600} className="w-32" value={d.timeLimitMinutes} onChange={(e) => set("timeLimitMinutes", e.target.value)} />
              </Field>
              {timerStart === null ? (
                <Button type="button" variant="secondary" disabled={!limit} onClick={() => { setTimerStart(Date.now()); setNow(Date.now()); }}>Start timer</Button>
              ) : (
                <div role="timer" aria-live="off" className={cx("rounded-lg px-3 py-2 font-mono text-lg tabular-nums", remaining <= 5 ? "bg-bad-soft text-bad" : "bg-surface text-ink")}>
                  {Math.floor(remaining)}:{String(Math.floor((remaining % 1) * 60)).padStart(2, "0")} left
                </div>
              )}
              {timerStart !== null && remaining === 0 && <Badge tone="bad">Time is up — finish your sentence and submit</Badge>}
            </div>
          )}
          <Field label="Essay text" htmlFor="essayText" error={errors.essayText} hint="Separate paragraphs with a blank line. Your text is saved before any AI call, so nothing is lost if assessment fails.">
            <Textarea id="essayText" rows={18} value={d.essayText} onChange={(e) => set("essayText", e.target.value)} className="prose-essay min-h-[22rem]" spellCheck={false} required />
          </Field>
          {d.context !== "exam_simulation" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Time limit (min)" htmlFor="tl2" optional><Input id="tl2" type="number" min={1} value={d.timeLimitMinutes} onChange={(e) => set("timeLimitMinutes", e.target.value)} /></Field>
              <Field label="Time used (min)" htmlFor="tu2" optional><Input id="tu2" type="number" min={0} value={d.timeUsedMinutes} onChange={(e) => set("timeUsedMinutes", e.target.value)} /></Field>
              <Field label="Written on" htmlFor="writtenAt" optional><Input id="writtenAt" type="date" value={d.writtenAt} onChange={(e) => set("writtenAt", e.target.value)} /></Field>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>4 · Rubric or teacher criteria</CardTitle>
          <Field label="Marking scheme" htmlFor="rubric" optional hint="If your teacher gave criteria for this task, paste them. They are treated as teacher-specific, not as official rules.">
            <Textarea id="rubric" rows={4} value={d.rubricText} onChange={(e) => set("rubricText", e.target.value)} />
          </Field>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardTitle>Assessment mode</CardTitle>
          <fieldset className="space-y-2">
            <legend className="sr-only">Assessment mode</legend>
            {MODES.map((m) => (
              <label key={m} className={cx("block cursor-pointer rounded-lg border p-3 transition-colors", mode === m ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--accent)]" />
                  <span className="font-medium text-ink">{MODE_INFO[m].label}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{MODE_INFO[m].short}</span>
              </label>
            ))}
          </fieldset>
        </Card>
        {missingWarnings.length > 0 && <Notice tone="warn"><ul className="list-disc space-y-1 pl-4">{missingWarnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
        <div id="form-status" className="space-y-3">
          {phase === "saving" && <LoadingNotice title="Saving your essay…" />}
          {phase === "assessing" && <LoadingNotice title="Assessing…" detail="A careful assessment usually takes 30–120 seconds. Your essay is already saved." />}
          {phase === "revising" && <LoadingNotice title="Writing your 15-point version…" detail="Step 2 of 2 — usually 1–2 minutes. Your essay and assessment are already saved." />}
          {failure && (
            <ErrorNotice
              title="Not finished"
              message={failure.message}
              action={failure.essayId ? <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/essays/${failure.essayId}`)}>Open the saved essay</Button> : undefined}
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" loading={phase === "assessing"} disabled={busy}>Save and assess</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => submit("aim15")}>Save and aim for 15</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => submit(false)}>Save without assessing</Button>
        </div>
        <p className="text-xs leading-relaxed text-muted"><strong>Aim for 15</strong> runs a strict assessment, then rewrites your essay as a 15-point version with phrase upgrades and ideas to improve. The score is an indicative estimate with a range — not an official grade and not a prediction of your teacher&apos;s mark.</p>
      </aside>
    </form>
  );
}
