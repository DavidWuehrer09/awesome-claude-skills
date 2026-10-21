"use client";

import clsx from "clsx";
import { ArrowLeft, Flag, MessageSquareWarning, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PointsRange, ProvenanceBadge } from "@/components/examiner/shared";
import { Badge, Button, Card, Dialog, Notice, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { type Assessment, DIMENSION_LABEL, ESTIMATE_DISCLAIMER, type Exam, type StudentExam } from "@/domain/examiner/model";
import { skillLabel } from "@/domain/examiner/weaknesses";
import { api, errorMessage } from "@/lib/api";

type Dispute = { id: string; commentId: string; argument: string; status: string; response?: string; at: string };
type Data = {
  assessment: { id: string; version: number; status: string; isDemo: boolean; promptVersion: string | null; data: (Assessment & { validationWarnings?: string[] }) | null; disputes: Dispute[]; unhelpful: { commentId: string }[] };
  attemptId: string; examTitle: string; view: StudentExam; expectations: Exam["hidden"]["taskExpectations"];
  version: { answers: Record<string, string> } | null;
  history: { id: string; version: number; status: string; estimate: Assessment["estimate"] | null }[];
};

const SEVERITY_TONE = { major: "danger", moderate: "warn", minor: "neutral", none: "sage" } as const;
const STATUS_LABEL: Record<string, string> = {
  incorrect: "Incorrect English", unnatural: "Unnatural", imprecise: "Imprecise", valid_less_effective: "Correct, but less effective", excellent: "Excellent", not_language: "Content / structure",
};
const LEVEL_TONE: Record<string, "sage" | "navy" | "neutral" | "warn" | "danger"> = { excellent: "sage", strong: "sage", solid: "navy", adequate: "neutral", weak: "warn", very_weak: "danger", not_assessed: "neutral" };

type Section = "feedback" | "lab" | "model" | "plan";

export function AssessmentReport({ id }: { id: string }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Section>("feedback");
  const [dispute, setDispute] = useState<{ commentId: string; mode: "dispute" | "unhelpful" } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Data>(`/api/examiner/assessments/${id}`).then(setD).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => void load(), [load]);

  const send = async () => {
    if (!dispute) return;
    setBusy(true);
    try {
      if (dispute.mode === "dispute") {
        const r = await api<{ dispute: Dispute }>(`/api/examiner/assessments/${id}/dispute`, { method: "POST", json: { commentId: dispute.commentId, argument: text } });
        toast({ tone: r.dispute.status === "open" ? "neutral" : "sage", text: r.dispute.status === "withdrawn" ? "Comment withdrawn" : r.dispute.status === "revised" ? "Comment revised" : r.dispute.status === "upheld" ? "The comment stands; see the explanation" : "Recorded" });
      } else {
        await api(`/api/examiner/assessments/${id}/unhelpful`, { method: "POST", json: { commentId: dispute.commentId, reason: text } });
        toast({ tone: "sage", text: "Thanks. Future feedback avoids this kind of comment." });
      }
      setDispute(null);
      setText("");
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!d) return <Spinner />;
  const a = d.assessment.data;
  if (d.assessment.status !== "complete" || !a) return <Notice tone="warn">This assessment is not complete. <Link className="underline" href={`/abitur/examiner/attempt/${d.attemptId}`}>Back to the attempt</Link></Notice>;
  const est = a.estimate;
  const prev = d.history.filter((h) => h.version < d.assessment.version && h.estimate).pop();
  const comments = [...a.comments].sort((x, y) => ["major", "moderate", "minor", "none"].indexOf(x.severity) - ["major", "moderate", "minor", "none"].indexOf(y.severity));
  const taskOf = (n: string) => d.view.tasks.find((t) => t.number === n);

  return (
    <>
      <Link href={`/abitur/examiner/attempt/${d.attemptId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Your answers</Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-2xl">{d.examTitle} <span className="text-ink-3">· version {d.assessment.version}</span></h1>
        {d.assessment.isDemo && <Badge tone="warn">demo assessment</Badge>}
      </div>
      {d.assessment.isDemo && <div className="mb-4"><Notice tone="warn" title="Demo mode">No AI read your answers. Only word counts and contractions were checked. Configure an AI provider for real feedback.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <h2 className="text-lg">Indicative estimate</h2>
            <div className="mt-2"><PointsRange low={est.low} high={est.high} best={est.best} /></div>
            {prev?.estimate && <p className="mt-1 text-sm text-ink-2">Version {prev.version}: {prev.estimate.low}–{prev.estimate.high}</p>}
            <p className="mt-2 text-xs text-ink-3">Basis: {est.basis === "approximation" ? "approximation (no teacher point bands)" : est.basis === "teacher_rubric" ? "your teacher's rubric" : "your teacher's points allocation"}. {ESTIMATE_DISCLAIMER}</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><h3 className="font-medium">What limits the mark</h3><ul className="mt-1 list-disc pl-5 text-ink-2">{est.limitingFactors.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h3 className="font-medium">Most valuable changes</h3><ul className="mt-1 list-disc pl-5 text-ink-2">{est.mostValuableChanges.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-2">Assumptions and evidence</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-2">{[...est.assumptions, ...est.evidence].map((x) => <li key={x}>{x}</li>)}</ul>
            </details>
          </Card>

          <Tabs value={tab} onChange={setTab} items={[
            { value: "feedback", label: `Feedback (${comments.filter((c) => !c.withdrawn).length})` }, { value: "lab", label: "Improvement Lab" },
            { value: "model", label: "Model answer" }, { value: "plan", label: "Plan" },
          ]} />

          {tab === "feedback" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-medium">Against your course</h3>
                  <p className="mt-1 text-sm text-ink-2">{a.courseSpecific.summary}</p>
                  {a.courseSpecific.appliedCriteria.map((c) => (
                    <div key={c.criterion} className="mt-2 text-sm"><ProvenanceBadge p={c.provenance} /> <span className="font-medium">{c.criterion}</span>: {c.judgement}{!c.evidenceSufficient && <span className="text-ink-3"> (limited evidence)</span>}</div>
                  ))}
                  {a.courseSpecific.insufficientEvidenceNotes.map((n) => <p key={n} className="mt-2 text-xs text-ink-3">{n}</p>)}
                </Card>
                <Card>
                  <h3 className="font-medium">By general standards</h3>
                  <p className="mt-1 text-sm text-ink-2">{a.independent.summary}</p>
                  {a.independent.standardsNote && <p className="mt-2 text-xs text-ink-3">{a.independent.standardsNote}</p>}
                </Card>
              </div>
              <Card>
                <h3 className="font-medium">Dimensions</h3>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {a.dimensions.filter((x) => x.applicable).map((x, i) => (
                    <li key={i} className="flex flex-wrap items-start gap-2 py-2">
                      <span className="font-medium sm:w-52 sm:shrink-0">{DIMENSION_LABEL[x.key]}{x.task ? ` (task ${x.task})` : ""}</span>
                      <Badge tone={LEVEL_TONE[x.level]}>{x.level.replace("_", " ")}</Badge>
                      <span className="w-full text-ink-2 sm:w-auto sm:min-w-0 sm:flex-1">{x.comment}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              {a.strengths.length > 0 && (
                <Card>
                  <h3 className="font-medium">What already works</h3>
                  <ul className="mt-2 space-y-2 text-sm">{a.strengths.map((s, i) => <li key={i}><q className="rounded bg-sage-soft px-1 text-sage">{s.original}</q> <span className="text-ink-2">— {s.whyStrong}</span></li>)}</ul>
                </Card>
              )}
              <div className="space-y-3">
                {comments.map((c) => {
                  const disputes = d.assessment.disputes.filter((x) => x.commentId === c.id);
                  return (
                    <Card key={c.id} className={clsx(c.withdrawn && "opacity-60")}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={SEVERITY_TONE[c.severity]}>{c.severity}</Badge>
                        <Badge>{STATUS_LABEL[c.englishStatus]}</Badge>
                        <ProvenanceBadge p={c.provenance} />
                        <span className="text-xs text-ink-3">task {c.task}</span>
                        {c.withdrawn && <Badge tone="sage">withdrawn after your objection</Badge>}
                      </div>
                      <p className="mt-2 text-sm"><q className={clsx("rounded px-1", c.withdrawn ? "line-through" : "bg-warn-soft")}>{c.original}</q></p>
                      <p className="mt-2 text-sm"><span className="font-medium">{c.problem}</span> {c.whyWeakens}</p>
                      {c.alternative && <p className="mt-2 text-sm">Better: <span className="rounded bg-sage-soft px-1 text-sage">{c.alternative}</span> <span className="text-ink-2">— {c.whyBetter}</span></p>}
                      {disputes.map((x) => (
                        <div key={x.id} className="mt-2 rounded-lg bg-surface-2 p-2 text-xs">
                          <p><span className="font-medium">Your objection:</span> {x.argument}</p>
                          {x.response && <p className="mt-1"><span className="font-medium">{x.status === "open" ? "Status" : `Response (${x.status})`}:</span> {x.response}</p>}
                        </div>
                      ))}
                      {!c.withdrawn && (
                        <div className="mt-2 flex gap-3 text-xs">
                          <button className="inline-flex items-center gap-1 text-ink-2 hover:text-ink" onClick={() => setDispute({ commentId: c.id, mode: "dispute" })}><Flag className="size-3.5" aria-hidden /> I disagree</button>
                          <button className="inline-flex items-center gap-1 text-ink-2 hover:text-ink" onClick={() => setDispute({ commentId: c.id, mode: "unhelpful" })}><ThumbsDown className="size-3.5" aria-hidden /> Not helpful</button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
              {a.vocabUsage.length > 0 && (
                <Card>
                  <h3 className="font-medium">Your vocabulary in this exam</h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">{a.vocabUsage.map((u) => <Badge key={u.term} tone={u.used ? (u.natural === false ? "warn" : "sage") : "neutral"} title={u.comment}>{u.term}{u.used ? "" : " (not used)"}</Badge>)}</ul>
                </Card>
              )}
            </>
          )}

          {tab === "lab" && (a.lab.length === 0 ? <Notice>No lab items in this assessment.</Notice> : a.lab.map((l, i) => (
            <Card key={i}>
              <p className="text-xs text-ink-3">Task {l.task} · your sentence</p>
              <p className="mt-1"><q className="rounded bg-surface-2 px-1">{l.original}</q></p>
              <ol className="mt-3 space-y-2 text-sm">
                <li><Badge>1 · correct</Badge> {l.level1Correct}</li>
                <li><Badge tone="navy">2 · stronger</Badge> {l.level2Stronger}</li>
                {l.level3HighLevel && <li><Badge tone="sage">3 · high level</Badge> {l.level3HighLevel}</li>}
              </ol>
              <div className="mt-3 space-y-1 text-sm text-ink-2">
                <p><span className="font-medium text-ink">Why it works:</span> {l.explanation.effective} {l.explanation.nuance}</p>
                <p><span className="font-medium text-ink">In this context:</span> {l.explanation.whyInContext}</p>
                {l.explanation.risks && <p><span className="font-medium text-ink">Watch out:</span> {l.explanation.risks}</p>}
              </div>
              <LabExercise ex={l.exercise} />
            </Card>
          )))}

          {tab === "model" && (
            <>
              <Notice>A model answer shows one strong way to answer. Other well-supported interpretations can be equally valid. Use it to learn, not to copy.</Notice>
              {a.modelAnswer.perTask.map((m) => (
                <Card key={m.task}>
                  <p className="text-sm font-medium">{m.task}. {taskOf(m.task)?.instruction}</p>
                  <div className="mt-2 whitespace-pre-wrap font-display text-[15px] leading-7">{m.text}</div>
                  {m.whyEffective.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-ink-2">{m.whyEffective.map((w) => <li key={w}>{w}</li>)}</ul>}
                  {d.expectations.filter((e) => e.task === m.task).map((e) => (
                    <details key={e.task} className="mt-3 text-sm"><summary className="cursor-pointer text-ink-2">What was expected</summary><ul className="mt-1 list-disc pl-5">{e.expectedContent.map((x) => <li key={x}>{x}</li>)}</ul></details>
                  ))}
                </Card>
              ))}
              {a.modelAnswer.comparisons.map((c, i) => (
                <Card key={i}>
                  <p className="text-xs text-ink-3">Task {c.task} · compared</p>
                  <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                    <div><p className="font-medium">You</p><p className="text-ink-2">{c.student}</p></div>
                    <div><p className="font-medium">Model</p><p className="text-ink-2">{c.model}</p></div>
                  </div>
                  <p className="mt-2 text-sm"><span className="text-sage">Already strong:</span> {c.alreadyStrong}</p>
                  <p className="text-sm"><span className="font-medium">Difference:</span> {c.difference}</p>
                </Card>
              ))}
              {a.modelAnswer.alternativeInterpretations.length > 0 && <Card><h3 className="font-medium">Other valid approaches</h3><ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{a.modelAnswer.alternativeInterpretations.map((x) => <li key={x}>{x}</li>)}</ul></Card>}
            </>
          )}

          {tab === "plan" && (
            <Card>
              <h3 className="font-medium">Improvement plan</h3>
              <ol className="mt-2 space-y-2 text-sm">{[...a.improvementPlan].sort((x, y) => x.priority - y.priority).map((p) => <li key={p.priority + p.focus}><span className="font-medium">{p.priority}. {p.focus}</span> — {p.action}</li>)}</ol>
              <Link className="mt-4 inline-block text-sm underline" href={`/abitur/examiner/attempt/${d.attemptId}`}>Revise your answers and get them assessed again</Link>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">Skills observed</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.weaknessObservations.map((w) => (
                <li key={w.skill} className="flex items-center justify-between gap-2">
                  <span>{skillLabel(w.skill)}</span>
                  <Badge tone={w.present ? SEVERITY_TONE[w.severity] : "sage"}>{w.present ? w.severity : "fine"}</Badge>
                </li>
              ))}
            </ul>
            <Link className="mt-3 inline-block text-sm underline" href="/abitur/examiner?tab=weaknesses">All weaknesses</Link>
          </Card>
          {(a.validationWarnings?.length ?? 0) > 0 && <Notice tone="warn" title="Check notes"><ul className="list-disc pl-5">{a.validationWarnings!.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
          <Card>
            <p className="text-xs text-ink-3"><MessageSquareWarning className="mr-1 inline size-3.5" aria-hidden />Every quotation in this report was checked against your answers and the exam&apos;s sources. If a comment seems wrong, use “I disagree”: valid objections lead to a revised or withdrawn comment.</p>
            {d.assessment.promptVersion && <p className="mt-2 text-xs text-ink-3">Prompt {d.assessment.promptVersion}</p>}
          </Card>
        </div>
      </div>

      <Dialog open={!!dispute} onClose={() => setDispute(null)} title={dispute?.mode === "dispute" ? "Why is this comment wrong?" : "Why was this not helpful?"}
        footer={<><Button variant="ghost" onClick={() => setDispute(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={text.trim().length < (dispute?.mode === "dispute" ? 10 : 3)} onClick={send}>Send</Button></>}>
        <Textarea aria-label="Your reason" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={dispute?.mode === "dispute" ? "e.g. The task asked for an informal blog post, so contractions fit." : "e.g. Too picky; it does not affect the mark."} />
      </Dialog>
    </>
  );
}

function LabExercise({ ex }: { ex: Assessment["lab"][number]["exercise"] }) {
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-line p-3 text-sm">
      <p className="font-medium">Try it: {ex.instruction}</p>
      {ex.material && <p className="mt-1 text-ink-2">{ex.material}</p>}
      <Textarea aria-label="Your attempt" rows={2} className="mt-2" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      {ex.answerKey && (shown ? <p className="mt-2 text-ink-2">Suggestion: {ex.answerKey}</p> : <Button size="sm" className="mt-2" disabled={!answer.trim()} onClick={() => setShown(true)}>Compare with a suggestion</Button>)}
    </div>
  );
}
