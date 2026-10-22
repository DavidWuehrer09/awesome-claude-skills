"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ExerciseEvaluationOutput } from "@/lib/ai/schemas";
import type { SkillKey } from "@/lib/learner/skills";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle, cx, ErrorNotice, Field, LoadingNotice, Notice, Textarea } from "@/components/ui";
import { StartButton } from "./GenerateExercise";

type Content = {
  title: string; objective: string; instructions: string; passage: string | null; items: { id: string; prompt: string }[];
  success_criteria: string[]; model_answer: string | null; answer_key: { item_id: string; answer: string; explanation: string }[] | null;
};
type Attempt = { id: string; answer: string; status: string; outcome: string | null; score: number | null; feedback: unknown; errorMessage: string | null; createdAt: string };
export type ExerciseData = { id: string; skillKey: string; type: string; difficulty: string; isTransfer: boolean; timeLimitMinutes: number | null; reason: string; content: Content; revealed: boolean; attempts: Attempt[]; sourceEssayId: string | null };

const tone = { correct: "good", partial: "warn", incorrect: "bad" } as const;

export function ExerciseRunner({ initial }: { initial: ExerciseData }) {
  const [ex, setEx] = useState(initial);
  const [answer, setAnswer] = useState(() => initial.content.items.map((i) => `${i.id}. `).join("\n\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const timed = Boolean(ex.timeLimitMinutes);

  useEffect(() => {
    if (!timed || ex.revealed) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [timed, ex.revealed]);

  const latest = ex.attempts[0];
  const fb = latest?.feedback as ExerciseEvaluationOutput | null | undefined;
  const remainingSec = timed ? Math.max(0, ex.timeLimitMinutes! * 60 - Math.floor((now - startedAt) / 1000)) : 0;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<ExerciseData>(`/api/exercises/${ex.id}/attempts`, { body: { answer, timeUsedSeconds: Math.round((Date.now() - startedAt) / 1000) } });
      setEx(r);
    } catch (err) {
      setError(errorMessage(err));
      try { setEx(await api<ExerciseData>(`/api/exercises/${ex.id}`)); } catch { /* ignore */ }
    }
    setBusy(false);
  };
  const retryEval = async () => {
    if (!latest) return;
    setBusy(true); setError(null);
    try { setEx(await api<ExerciseData>(`/api/attempts/${latest.id}/evaluate`, { body: {} })); }
    catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const c = ex.content;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Card>
          <p className="text-sm font-medium text-accent">Objective</p>
          <p className="mt-1 text-ink">{c.objective}</p>
          <p className="mt-4 text-sm font-medium text-accent">Instructions</p>
          <p className="mt-1 whitespace-pre-wrap text-ink-2">{c.instructions}</p>
          {c.passage && <div className="prose-essay mt-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-4 text-ink">{c.passage}</div>}
          <ol className="mt-4 space-y-2">{c.items.map((i) => <li key={i.id} className="text-ink"><span className="mr-2 font-semibold text-muted">{i.id}.</span>{i.prompt}</li>)}</ol>
        </Card>

        {!ex.revealed || latest?.status === "evaluation_failed" ? (
          <Card>
            <CardTitle aside={timed && !ex.revealed && <span role="timer" className={cx("rounded-md px-2 py-1 font-mono text-sm tabular-nums", remainingSec < 120 ? "bg-bad-soft text-bad" : "bg-surface-2 text-ink")}>{Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}</span>}>Your answer</CardTitle>
            {latest?.status === "evaluation_failed" ? (
              <div className="space-y-3">
                <Notice tone="warn">Your answer was saved, but it has not been evaluated yet: {latest.errorMessage}</Notice>
                <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-serif text-ink">{latest.answer}</p>
                <Button onClick={retryEval} loading={busy}>Retry evaluation</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Answer" htmlFor="answer" hint="Answer every item. Your answer is saved before it is evaluated.">
                  <Textarea id="answer" rows={12} value={answer} onChange={(e) => setAnswer(e.target.value)} className="prose-essay" />
                </Field>
                {busy && <LoadingNotice title="Evaluating your answer…" />}
                <Button onClick={submit} loading={busy} disabled={!answer.trim()}>Submit answer</Button>
              </div>
            )}
            {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
          </Card>
        ) : null}

        {fb && latest?.status === "evaluated" && (
          <Card className="border-accent/25">
            <CardTitle aside={<Badge tone={tone[fb.outcome]}>{fb.outcome} · {Math.round(fb.score * 100)}%</Badge>}>Feedback</CardTitle>
            <div className="space-y-4 text-sm leading-relaxed text-ink-2">
              <details><summary className="cursor-pointer text-muted">Your answer</summary><p className="mt-2 whitespace-pre-wrap font-serif text-ink">{latest.answer}</p></details>
              <ul className="space-y-2">{fb.item_feedback.map((f) => <li key={f.item_id}><Badge tone={tone[f.verdict]}>{f.item_id}: {f.verdict}</Badge> <span className="ml-1">{f.comment}</span></li>)}</ul>
              {fb.strengths.length > 0 && <div><p className="font-semibold text-good">What worked</p><ul className="list-disc pl-5">{fb.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {fb.improvements.length > 0 && <div><p className="font-semibold text-ink">To improve</p><ul className="list-disc pl-5">{fb.improvements.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {fb.corrected_version && <div><p className="font-semibold text-ink">Your answer, improved</p><p className="whitespace-pre-wrap font-serif text-ink">{fb.corrected_version}</p></div>}
              <Notice tone="accent"><strong>Next step:</strong> {fb.follow_up}</Notice>
            </div>
          </Card>
        )}

        {ex.revealed && c.model_answer && (
          <Card>
            <CardTitle>Model answer and key</CardTitle>
            <p className="whitespace-pre-wrap font-serif text-ink">{c.model_answer}</p>
            {c.answer_key && c.answer_key.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm text-ink-2">{c.answer_key.map((k) => <li key={k.item_id}><span className="font-semibold text-ink">{k.item_id}.</span> {k.answer} <span className="text-muted">— {k.explanation}</span></li>)}</ul>
            )}
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardTitle>Success criteria</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{c.success_criteria.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="mt-3 text-xs text-muted">Why this exercise: {ex.reason}</p>
          {!ex.revealed && <p className="mt-2 text-xs text-muted">The model answer appears after you submit.</p>}
        </Card>
        {ex.revealed && (
          <Card>
            <CardTitle>Keep going</CardTitle>
            <div className="space-y-3">
              <StartButton skillKey={ex.skillKey as SkillKey} label="Another exercise on this skill" sourceEssayId={ex.sourceEssayId} />
              <StartButton skillKey={ex.skillKey as SkillKey} type="transfer" isTransfer label="Transfer: apply it to a new text" />
              <Link href="/training" className="block text-sm text-accent underline">Back to Personal Training</Link>
            </div>
          </Card>
        )}
      </aside>
    </div>
  );
}
