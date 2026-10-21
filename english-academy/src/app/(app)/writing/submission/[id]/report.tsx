"use client";

import clsx from "clsx";
import { ArrowLeft, BookOpen, Check, HelpCircle, MessageSquareWarning, PenLine, RefreshCw, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SourceText } from "@/components/writing/source-text";
import { Badge, Button, Card, Dialog, LinkButton, Notice, Select, Spinner, Textarea, Toggle, useToast } from "@/components/ui";
import { DIMENSION_LABEL } from "@/domain/writing/rubrics";
import { api, ApiError, errorMessage } from "@/lib/api";
import { wordDiff } from "@/lib/diff";

type Annotation = { id: string; excerpt: string; category: string; priority: string; isError: boolean; explanation: string; suggestion: string; question: string | null };
type Result = {
  summary: string; rubricName: string;
  dimensions: { key: string; level: string; assessment: string; evidence: string[]; strengths: string[]; weaknesses: string[]; improvement: string }[];
  annotations: Annotation[];
  strengths: string[];
  priorities: { rank: number; focus: string; action: string }[];
  vocabulary: { targetUse: { word: string; status: string; comment: string }[]; missedOpportunities: { word: string; where: string }[]; simplerBetter: { excerpt: string; simpler: string }[] };
  exercise: { skill: string; instruction: string; items: string[] };
  estimate: { low: number; high: number; best: number | null; explanation: string; uncertainty: string } | null;
};
type Data = {
  submission: { id: string; draftId: string; body: string; versionNo: number; wordCount: number; createdAt: string };
  assessment: { id: string; status: string; isDemo: boolean; model: string | null; promptVersion: string | null; error: string | null; result: Result | null } | null;
  prompt: { title: string; section: string; taskType: string; instructions: string; sourceText: string | null; sourceLabel: string | null; answerKey: string | null; minWords: number | null; maxWords: number | null } | null;
  responses: { annotationId: string; action: string; message: string | null; reply: { decision?: string; explanation?: string; revisedSuggestion?: string | null; demo?: boolean } | null }[];
  versions: { id: string; versionNo: number }[];
  /** status: the assessment's judgement of the word (null until a real assessment exists). */
  vocabularyUsed: { id: string; headword: string; status: "correct" | "unnatural" | "incorrect" | "used" | null }[];
};
type Applied = { status: "applied" | "not_found" | "ambiguous"; message: string } | null;
const WORD_TONE = { correct: "sage", used: "neutral", unnatural: "warn", incorrect: "danger" } as const;

const PRIORITY_ORDER = ["meaning", "serious_grammar", "vocabulary_misuse", "unnatural", "structural", "optional"];
const PRIORITY_LABEL: Record<string, string> = {
  meaning: "Changes the meaning", serious_grammar: "Serious grammar", vocabulary_misuse: "Vocabulary misuse", unnatural: "Unnatural", structural: "Structure", optional: "Optional refinement",
};
const LEVEL_TONE: Record<string, "sage" | "navy" | "warn" | "danger" | "neutral"> = { excellent: "sage", strong: "sage", solid: "navy", developing: "warn", weak: "danger", not_applicable: "neutral" };

function Highlighted({ text, annotations, active, onPick }: { text: string; annotations: Annotation[]; active: string | null; onPick: (id: string) => void }) {
  const marks = useMemo(() => {
    const lower = text.toLowerCase();
    const found: { start: number; end: number; a: Annotation }[] = [];
    for (const a of annotations) {
      const i = lower.indexOf(a.excerpt.toLowerCase().trim());
      if (i >= 0 && !found.some((f) => i < f.end && i + a.excerpt.length > f.start)) found.push({ start: i, end: i + a.excerpt.trim().length, a });
    }
    return found.sort((x, y) => x.start - y.start);
  }, [text, annotations]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start > pos) parts.push(text.slice(pos, m.start));
    parts.push(
      <button key={m.a.id} type="button" onClick={() => onPick(m.a.id)}
        className={clsx("rounded-sm px-0.5 text-left underline decoration-2 underline-offset-4",
          m.a.isError ? "decoration-danger/70" : "decoration-navy/50", active === m.a.id ? "bg-accent-soft" : "hover:bg-surface-2")}>
        {text.slice(m.start, m.end)}
      </button>,
    );
    pos = m.end;
  }
  parts.push(text.slice(pos));
  return <div className="whitespace-pre-wrap font-display text-[17px] leading-8">{parts}</div>;
}

export function SubmissionReport({ id }: { id: string }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wantEstimate, setWantEstimate] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ a: Annotation; mode: "challenge" | "clarify" } | null>(null);
  const [argument, setArgument] = useState("");
  const [compareWith, setCompareWith] = useState("");
  const [compareBody, setCompareBody] = useState<string | null>(null);
  const [applying, setApplying] = useState<{ a: Annotation; replacement: string; draftVersion: number | null } | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const load = useCallback(() => api<Data>(`/api/writing/submissions/${id}`).then(setData).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!compareWith) return;
    api<Data>(`/api/writing/submissions/${compareWith}`).then((d) => setCompareBody(d.submission.body)).catch(() => setCompareBody(null));
  }, [compareWith]);

  const assess = async () => {
    setBusy(true);
    try {
      await api(`/api/writing/submissions/${id}/assess`, { method: "POST", json: { wantEstimate } });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: `${errorMessage(e)} Your text is saved; you can try again.` });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const respond = async (a: Annotation, action: "understood" | "accepted" | "rejected" | "challenge" | "clarify", message?: string, apply?: { replacement: string; draftVersion: number }) => {
    if (!data?.assessment) return;
    try {
      const r = await api<{ applied: Applied }>(`/api/writing/assessments/${data.assessment.id}/feedback`, { method: "POST", json: { annotationId: a.id, action, message, apply } });
      if (action === "challenge" || action === "clarify") setChallenge(null);
      setArgument("");
      if (r.applied) toast({ tone: r.applied.status === "applied" ? "sage" : "warn", text: r.applied.message });
      await load();
      return true;
    } catch (e) {
      toast({ tone: "danger", text: e instanceof ApiError && e.status === 409 ? "Your draft changed in the meantime. Nothing was applied; open the suggestion again to retry." : errorMessage(e) });
      return false;
    }
  };

  /** Accepting a suggestion offers to apply it: the replacement is editable because suggestions are not always literal text. */
  const openApply = async (a: Annotation) => {
    const revised = [...(data?.responses ?? [])].reverse().find((x) => x.annotationId === a.id && x.reply?.revisedSuggestion)?.reply?.revisedSuggestion;
    setApplying({ a, replacement: revised ?? a.suggestion, draftVersion: null });
    try {
      const d = await api<{ draft: { version: number } }>(`/api/writing/drafts/${data!.submission.draftId}`);
      setApplying((cur) => (cur && cur.a.id === a.id ? { ...cur, draftVersion: d.draft.version } : cur));
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
      setApplying(null);
    }
  };
  const confirmApply = async (toDraft: boolean) => {
    if (!applying) return;
    setApplyBusy(true);
    const ok = await respond(applying.a, "accepted", undefined, toDraft && applying.draftVersion ? { replacement: applying.replacement, draftVersion: applying.draftVersion } : undefined);
    setApplyBusy(false);
    if (ok || toDraft) setApplying(null);
  };

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Spinner />;
  const { submission, assessment, prompt } = data;
  const r = assessment?.status === "complete" ? assessment.result : null;
  const responseFor = (aid: string) => data.responses.filter((x) => x.annotationId === aid);
  const sortedAnnotations = r ? [...r.annotations].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)) : [];
  const isAbitur = prompt?.section === "abitur";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/writing/${submission.draftId}`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Back to draft</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="navy">Version {submission.versionNo}</Badge>
          <Badge>{submission.wordCount} words</Badge>
          <LinkButton href={`/writing/${submission.draftId}`} size="sm" variant="primary"><PenLine className="size-4" aria-hidden /> Revise</LinkButton>
        </div>
      </div>
      <h1 className="text-2xl">{prompt?.title ?? "Your text"}</h1>

      {!assessment || assessment.status === "failed" ? (
        <Card className="space-y-3">
          {assessment?.status === "failed" && <Notice tone="warn" title="The assessment did not complete">{assessment.error} Your submission is saved unchanged.</Notice>}
          <p className="text-ink-2">Get structured feedback with a task-specific practice rubric: strengths, prioritised corrections and a targeted exercise. Feedback explains; it does not rewrite your whole text.</p>
          {isAbitur && <Toggle checked={wantEstimate} onChange={setWantEstimate} label="Include an indicative 0–15 point estimate" description="An AI estimate using a practice rubric: not an official grade, and the feedback matters more than the number." />}
          <Button variant="primary" onClick={assess} loading={busy}>{assessment?.status === "failed" ? <><RefreshCw className="size-4" aria-hidden /> Try again</> : "Get feedback"}</Button>
        </Card>
      ) : assessment.status === "pending" ? (
        <Card><Spinner label="Assessing… this can take up to a minute" /><p className="mt-2 text-sm text-ink-3">You can leave this page; the result is stored. <button className="underline" onClick={load}>Refresh</button></p></Card>
      ) : null}

      {r && (
        <>
          {assessment?.isDemo && <Notice tone="warn" title="Demo check">No AI provider is configured, so only surface features were checked. This is not an assessment of your content or language.</Notice>}
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg">Overall</h2>
              <Badge>{r.rubricName}{!assessment?.isDemo && " · practice rubric, not an official one"}</Badge>
            </div>
            <p className="mt-2 text-ink">{r.summary}</p>
            {r.strengths.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-sage">What already works</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {r.priorities.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-ink-2">Most important next steps</h3>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{[...r.priorities].sort((a, b) => a.rank - b.rank).map((p, i) => <li key={i}><strong>{p.focus}:</strong> {p.action}</li>)}</ol>
              </div>
            )}
          </Card>

          {r.estimate && (
            <Card className="border-accent/40">
              <h2 className="text-lg">Indicative estimate</h2>
              <p className="mt-1 font-display text-4xl">{r.estimate.low}–{r.estimate.high} <span className="text-lg text-ink-3">points{r.estimate.best !== null ? ` (most likely ${r.estimate.best})` : ""}</span></p>
              <div className="mt-3 grid grid-cols-16 gap-0.5" aria-hidden>
                {Array.from({ length: 16 }, (_, p) => <div key={p} className={clsx("h-2 rounded-sm", p >= r.estimate!.low && p <= r.estimate!.high ? "bg-accent" : "bg-surface-2")} />)}
              </div>
              <p className="mt-3 text-sm text-ink-2">{r.estimate.explanation}</p>
              <p className="mt-1 text-sm text-ink-3">Uncertainty: {r.estimate.uncertainty}</p>
              <p className="mt-2 text-xs text-ink-3">AI-generated estimate with a practice rubric. It does not reproduce a teacher&apos;s marking, is not an official grade, and excellent English alone does not guarantee task fulfilment.</p>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <h2 className="mb-3 text-lg">Your text</h2>
              <Highlighted text={submission.body} annotations={r.annotations} active={active} onPick={(aid) => { setActive(aid); document.getElementById(`ann-${aid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
              <p className="mt-3 text-xs text-ink-3">Red underline: error · blue underline: suggestion. Tap to see the comment.</p>
            </Card>
            <div className="space-y-3">
              <h2 className="text-lg">Comments ({sortedAnnotations.length})</h2>
              {sortedAnnotations.map((a) => {
                const resp = responseFor(a.id);
                const last = resp[resp.length - 1];
                return (
                  <Card key={a.id} className={clsx("p-4", active === a.id && "ring-2 ring-accent")} as="article">
                    <div id={`ann-${a.id}`} className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={a.isError ? "danger" : "navy"}>{a.isError ? "Error" : "Suggestion"}</Badge>
                      <Badge>{a.category}</Badge>
                      <Badge tone="neutral">{PRIORITY_LABEL[a.priority] ?? a.priority}</Badge>
                    </div>
                    <p className="mt-2 font-display">“{a.excerpt}”</p>
                    <p className="mt-1 text-sm text-ink-2">{a.explanation}</p>
                    {a.question ? (
                      <details className="mt-2 text-sm"><summary className="cursor-pointer text-navy">{a.question} (try first, then show a suggestion)</summary><p className="mt-1">{a.suggestion}</p></details>
                    ) : <p className="mt-2 text-sm"><span className="text-ink-3">Suggestion: </span>{a.suggestion}</p>}
                    {resp.filter((x) => x.reply).map((x, i) => (
                      <div key={i} className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                        <p className="text-xs text-ink-3">You: {x.message ?? (x.action === "clarify" ? "Please explain more simply." : "")}</p>
                        <p className="mt-1"><Badge tone={x.reply?.decision === "upheld" ? "navy" : "sage"}>{x.reply?.decision}</Badge> {x.reply?.explanation}</p>
                        {x.reply?.revisedSuggestion && <p className="mt-1"><span className="text-ink-3">Revised: </span>{x.reply.revisedSuggestion}</p>}
                      </div>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant={last?.action === "understood" ? "primary" : "secondary"} onClick={() => respond(a, "understood")}><Check className="size-3.5" aria-hidden /> Understood</Button>
                      <Button size="sm" onClick={() => setChallenge({ a, mode: "clarify" })}><HelpCircle className="size-3.5" aria-hidden /> Explain more</Button>
                      <Button size="sm" onClick={() => setChallenge({ a, mode: "challenge" })}><MessageSquareWarning className="size-3.5" aria-hidden /> I disagree</Button>
                      {a.isError && <Button size="sm" onClick={() => void openApply(a)}><Wand2 className="size-3.5" aria-hidden /> Fix in draft</Button>}
                      {!a.isError && <Button size="sm" variant={last?.action === "accepted" ? "primary" : "ghost"} onClick={() => void openApply(a)} aria-label="Accept suggestion"><ThumbsUp className="size-3.5" /></Button>}
                      {!a.isError && <Button size="sm" variant="ghost" onClick={() => respond(a, "rejected")} aria-label="Reject suggestion"><ThumbsDown className="size-3.5" /></Button>}
                    </div>
                  </Card>
                );
              })}
              {!sortedAnnotations.length && <p className="text-sm text-ink-3">No line comments.</p>}
            </div>
          </div>

          <Card>
            <h2 className="text-lg">By dimension</h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {r.dimensions.filter((d) => d.level !== "not_applicable").map((d) => (
                <li key={d.key} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{DIMENSION_LABEL[d.key] ?? d.key}</span><Badge tone={LEVEL_TONE[d.level]}>{d.level}</Badge></div>
                  <p className="mt-1 text-sm text-ink-2">{d.assessment}</p>
                  {d.evidence.length > 0 && <p className="mt-1 text-xs text-ink-3">Evidence: {d.evidence.map((e) => `“${e}”`).join(" · ")}</p>}
                  {d.improvement && <p className="mt-1 text-sm"><span className="text-ink-3">Improve: </span>{d.improvement}</p>}
                </li>
              ))}
            </ul>
            {r.dimensions.some((d) => d.level === "not_applicable") && <p className="mt-2 text-xs text-ink-3">Not applicable to this task: {r.dimensions.filter((d) => d.level === "not_applicable").map((d) => DIMENSION_LABEL[d.key] ?? d.key).join(", ")}.</p>}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <h2 className="text-lg">Vocabulary</h2>
              {r.vocabulary.targetUse.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {r.vocabulary.targetUse.map((t) => (
                    <li key={t.word}><Badge tone={t.status === "correct" ? "sage" : t.status === "not_needed" ? "neutral" : t.status === "not_used" ? "neutral" : "warn"}>{t.status.replace("_", " ")}</Badge> <strong>{t.word}</strong> – {t.comment}</li>
                  ))}
                </ul>
              )}
              {r.vocabulary.missedOpportunities.length > 0 && <p className="mt-3 text-sm"><span className="text-ink-3">Could have strengthened the text: </span>{r.vocabulary.missedOpportunities.map((m) => `${m.word} (${m.where})`).join("; ")}</p>}
              {r.vocabulary.simplerBetter.length > 0 && (
                <div className="mt-3 text-sm"><p className="text-ink-3">Simpler would be better:</p>
                  <ul className="list-disc pl-5">{r.vocabulary.simplerBetter.map((s, i) => <li key={i}>“{s.excerpt}” → {s.simpler}</li>)}</ul></div>
              )}
              {data.vocabularyUsed.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="text-ink-3">Words from your vocabulary in this text{assessment?.isDemo ? " (use not judged in demo mode)" : ""}:</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {data.vocabularyUsed.map((v) => <Badge key={v.id} tone={v.status ? WORD_TONE[v.status] : "neutral"} title={v.status ?? undefined}>{v.headword}{v.status && v.status !== "used" ? ` · ${v.status}` : ""}</Badge>)}
                  </div>
                  {!assessment?.isDemo && <p className="mt-1 text-xs text-ink-3">Each counts as writing practice for that word; words the feedback did not comment on get a smaller credit.</p>}
                </div>
              )}
              {(() => {
                const misused = data.vocabularyUsed.filter((v) => v.status === "incorrect" || v.status === "unnatural");
                return misused.length > 0 && (
                  <div className="mt-3 rounded-lg border border-line p-3 text-sm">
                    <p>Misused or unnatural here: <strong>{misused.map((v) => v.headword).join(", ")}</strong></p>
                    <LinkButton size="sm" className="mt-2" href={`/learn/session?mode=practice&ids=${misused.map((v) => v.id).join(",")}`}><BookOpen className="size-4" aria-hidden /> Practise the words you misused</LinkButton>
                  </div>
                );
              })()}
            </Card>
            <Card>
              <h2 className="text-lg">Practise the weakest skill</h2>
              <p className="mt-1 text-sm text-ink-3">{r.exercise.skill}</p>
              <p className="mt-2">{r.exercise.instruction}</p>
              {r.exercise.items.length > 0 && <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{r.exercise.items.map((x, i) => <li key={i}>{x}</li>)}</ol>}
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton size="sm" href="/writing/new?section=sentence">Sentence Laboratory</LinkButton>
                <LinkButton size="sm" href={`/tutor?ask=${encodeURIComponent(`Give me a short exercise on ${r.exercise.skill}.`)}`}>Ask the tutor</LinkButton>
              </div>
            </Card>
          </div>
          <p className="text-xs text-ink-3">Assessment by {assessment?.isDemo ? "demo rules" : assessment?.model} · {assessment?.promptVersion}. AI feedback can be wrong: challenge any comment you disagree with.</p>
        </>
      )}

      {prompt?.answerKey && (
        <Card>
          <h2 className="text-lg">Model / answer key</h2>
          <p className="mt-2 whitespace-pre-line text-ink-2">{prompt.answerKey}</p>
          <p className="mt-2 text-xs text-ink-3">One good possibility, not the only correct answer.</p>
        </Card>
      )}

      {data.versions.length > 1 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Compare versions</h2>
            <Select aria-label="Compare with version" value={compareWith} onChange={(e) => setCompareWith(e.target.value)} className="w-48">
              <option value="">Choose a version…</option>
              {data.versions.filter((v) => v.id !== id).map((v) => <option key={v.id} value={v.id}>Version {v.versionNo}</option>)}
            </Select>
          </div>
          {compareWith && compareBody !== null && (
            <div className="mt-3 whitespace-pre-wrap font-display leading-8">
              {wordDiff(compareBody, submission.body).map((p, i) => (
                <span key={i} className={p.type === "added" ? "bg-sage-soft text-sage" : p.type === "removed" ? "bg-danger-soft text-danger line-through" : ""}>{p.text}</span>
              ))}
            </div>
          )}
        </Card>
      )}

      {prompt?.sourceText && (
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-medium">Task and source text</summary>
          <p className="mt-2 text-ink-2">{prompt.instructions}</p>
          <div className="mt-3"><SourceText text={prompt.sourceText} label={prompt.sourceLabel} /></div>
        </details>
      )}

      <Dialog open={!!applying} onClose={() => setApplying(null)} title={applying?.a.isError ? "Fix this in your draft" : "Accept this suggestion"}
        footer={<>
          <Button onClick={() => setApplying(null)}>Cancel</Button>
          {!applying?.a.isError && <Button onClick={() => void confirmApply(false)} disabled={applyBusy}>Accept only</Button>}
          <Button variant="primary" onClick={() => void confirmApply(true)} loading={applyBusy} disabled={!applying?.draftVersion || !applying.replacement.trim()}>Apply to draft</Button>
        </>}>
        <p className="text-sm text-ink-2">Replace in your latest draft:</p>
        <p className="mt-1 font-display">“{applying?.a.excerpt}”</p>
        <label htmlFor="apply-replacement" className="mt-3 block text-sm text-ink-2">with</label>
        <Textarea id="apply-replacement" rows={3} value={applying?.replacement ?? ""} onChange={(e) => setApplying((cur) => (cur ? { ...cur, replacement: e.target.value } : cur))} />
        <p className="mt-2 text-xs text-ink-3">Suggestions are sometimes advice rather than ready-made text: check the wording before applying. The passage is only replaced if it occurs exactly once in your draft; this version stays unchanged.</p>
      </Dialog>

      <Dialog open={!!challenge} onClose={() => setChallenge(null)} title={challenge?.mode === "challenge" ? "Why do you disagree?" : "What is unclear?"}
        footer={<><Button onClick={() => setChallenge(null)}>Cancel</Button><Button variant="primary" onClick={() => challenge && respond(challenge.a, challenge.mode, argument || undefined)} disabled={challenge?.mode === "challenge" && !argument.trim()}>Send</Button></>}>
        <p className="mb-2 text-sm text-ink-2">Comment: “{challenge?.a.excerpt}” – {challenge?.a.explanation}</p>
        <Textarea rows={4} value={argument} onChange={(e) => setArgument(e.target.value)} aria-label="Your message"
          placeholder={challenge?.mode === "challenge" ? "e.g. This collocation is listed in the Oxford Collocations Dictionary…" : "Optional: what exactly is unclear?"} />
        <p className="mt-2 text-xs text-ink-3">The comment is re-examined. If your argument is valid it will be revised or withdrawn.</p>
      </Dialog>
    </div>
  );
}
