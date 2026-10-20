"use client";

import clsx from "clsx";
import { Check, ChevronRight, Edit3, Lightbulb, MessagesSquare, RotateCcw, Undo2, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, LinkButton, Meter, Notice, Textarea, useToast } from "@/components/ui";
import { checkAnswer, verdictMessage, verdictToOutcome, type Tolerance, type Verdict } from "@/domain/learning/answers";
import type { Exercise } from "@/domain/learning/exercises";
import { RATING_LABELS } from "@/domain/learning/scheduler";
import { api, errorMessage } from "@/lib/api";
import { enqueueReview, flushReviews, newEventId, pendingReviews, removeReview } from "@/lib/offline";
import { REASON_TEXT, type RunnerCard } from "./types";

type Phase = "answer" | "feedback";
type Outcome = "correct" | "alternative" | "typo" | "partial" | "wrong" | "revealed";
type Evaluation = {
  verdict: string; score: number; summary: string; hintQuestion: string | null; improvedVersion: string | null; alternatives: string[];
  issues: { excerpt: string; category: string; severity: string; explanation: string; suggestion: string }[];
  targetWordUse: { word: string; used: boolean; correct: boolean | null; natural: boolean | null; comment: string }[];
};
type Logged = { clientEventId: string; cardIndex: number; outcome: Outcome };

const GRADES = [1, 2, 3, 4] as const;

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(text.replace(/^to /, ""));
  u.lang = "en-GB";
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

export function SessionRunner({
  cards: initialCards, title, tolerance = "normal", sessionMode, topicId, timerSeconds, onFinish, summaryExtra,
}: {
  cards: RunnerCard[]; title: string; tolerance?: Tolerance; sessionMode: string; topicId?: string | null; timerSeconds?: number;
  onFinish?: (stats: Record<string, number>) => void; summaryExtra?: (log: { card: RunnerCard; outcome: Outcome }[]) => React.ReactNode;
}) {
  const toast = useToast();
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("answer");
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [evaluation, setEvaluation] = useState<{ data: Evaluation; demo: boolean } | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [log, setLog] = useState<Logged[]>([]);
  const [results, setResults] = useState<{ card: RunnerCard; outcome: Outcome }[]>([]);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [activeMs, setActiveMs] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timerSeconds ?? 0);
  const shownAt = useRef(0); // set when each card is shown (effect below)
  const touch = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scheduledOnce = useRef(new Set<string>());
  const card = cards[index];
  const ex: Exercise | undefined = card?.exercise;
  const done = index >= cards.length || (timerSeconds !== undefined && timeLeft <= 0 && phase === "answer");

  useEffect(() => {
    api<{ session: { id: string } }>("/api/learn/study-session", { method: "POST", json: { op: "start", mode: sessionMode, topicId: topicId ?? null, minutes: null } })
      .then((r) => setStudySessionId(r.session.id)).catch(() => {});
  }, [sessionMode, topicId]);

  useEffect(() => {
    if (!timerSeconds) return;
    const t = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [timerSeconds]);

  useEffect(() => {
    shownAt.current = Date.now();
    if (ex?.answer.type === "typed") setTimeout(() => inputRef.current?.focus(), 30);
  }, [index, ex]);

  // One answer per card: a double tap or repeated key while the answer is being saved must not
  // record twice or skip the next card. Released when the next card is shown.
  const answering = useRef(false);
  const once = async (fn: () => Promise<void>) => {
    if (answering.current) return;
    answering.current = true;
    try {
      await fn();
    } catch (e) {
      answering.current = false;
      throw e;
    }
  };

  const resetCard = () => {
    answering.current = false;
    setPhase("answer");
    setFlipped(false);
    setTyped("");
    setVerdict(null);
    setChoice(null);
    setHints(0);
    setEvaluation(null);
    setEvalError(null);
    setAttempt(1);
  };

  const record = useCallback(async (outcome: Outcome, opts: { selfRating?: 1 | 2 | 3 | 4; score?: number; answer?: string }) => {
    if (!card || !ex) return;
    const firstForEntry = !scheduledOnce.current.has(ex.entryId);
    const schedule = card.schedule && firstForEntry;
    if (schedule) scheduledOnce.current.add(ex.entryId);
    const latencyMs = Math.min(3_600_000, Date.now() - shownAt.current);
    setActiveMs((ms) => ms + Math.min(latencyMs, 5 * 60000));
    const ev = {
      clientEventId: newEventId(),
      entryId: ex.entryId,
      sessionId: studySessionId,
      exerciseKind: ex.kind,
      dimension: ex.dimension,
      outcome,
      independent: ex.answer.type !== "self" && ex.answer.type !== "choice",
      recognitionOnly: ex.recognitionOnly,
      hintsUsed: hints,
      selfRating: opts.selfRating ?? null,
      latencyMs,
      answer: opts.answer?.slice(0, 300) ?? null,
      schedule,
      score: opts.score ?? null,
      reviewedAt: new Date().toISOString(),
    };
    try {
      await enqueueReview(ev);
      void flushReviews();
    } catch {
      // IndexedDB unavailable (private mode): send directly.
      await api("/api/learn/reviews", { method: "POST", json: { events: [ev] } }).catch(() => toast({ tone: "danger", text: "Could not save this answer. Check your connection." }));
    }
    setLog((l) => [...l, { clientEventId: ev.clientEventId, cardIndex: index, outcome }]);
    setResults((r) => [...r, { card, outcome }]);
    // In-session relearning: failed words come back after a few cards (max twice), as practice.
    if ((outcome === "wrong" || outcome === "revealed") && cards.filter((c) => c.exercise.entryId === ex.entryId).length < 3) {
      setCards((cs) => {
        const at = Math.min(cs.length, index + 4);
        const retry: RunnerCard = { ...card, schedule: false, reason: "retry" };
        return [...cs.slice(0, at), retry, ...cs.slice(at)];
      });
    }
  }, [card, ex, hints, index, studySessionId, cards, toast]);

  const next = () => {
    resetCard();
    setIndex((i) => i + 1);
  };

  // ---------------------------------------------------------------- answer handlers

  const rateSelf = (grade: 1 | 2 | 3 | 4) => once(async () => {
    await record(grade === 1 ? "wrong" : "correct", { selfRating: grade });
    next();
  });

  const submitTyped = () => {
    if (!ex || ex.answer.type !== "typed" || phase !== "answer") return;
    const v = checkAnswer(typed, { ...ex.answer.spec, tolerance: ex.answer.spec.tolerance ?? tolerance });
    setVerdict(v);
    setPhase("feedback");
  };

  const finishTyped = (selfRating?: 1 | 2 | 3 | 4) => once(async () => {
    if (!verdict) return;
    await record(verdictToOutcome(verdict), { selfRating, answer: typed });
    next();
  });

  const acceptMine = async () => {
    if (!ex) return;
    try {
      await api("/api/learn/accept-answer", { method: "POST", json: { entryId: ex.entryId, answer: typed.trim() } });
      setVerdict({ kind: "alternative", matched: typed.trim() });
      toast({ tone: "sage", text: `“${typed.trim()}” will be accepted from now on (editable in the word).` });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  const pickChoice = (i: number) => {
    if (phase !== "answer") return;
    setChoice(i);
    setPhase("feedback");
  };

  const finishChoice = () => once(async () => {
    if (!ex || ex.answer.type !== "choice" || choice === null) return;
    await record(choice === ex.answer.correct ? "correct" : "wrong", { answer: ex.answer.options[choice] });
    next();
  });

  const evaluateFree = async () => {
    if (!ex || ex.answer.type !== "free" || !typed.trim()) return;
    setEvalBusy(true);
    setEvalError(null);
    try {
      const task = card.ai?.task ?? "production";
      const r = await api<{ evaluation: Evaluation; meta: { demo: boolean } }>("/api/learn/evaluate", {
        method: "POST",
        json: {
          task, instructions: `${ex.prompt}${ex.context ? `\n${ex.context}` : ""}`, objective: `Use “${ex.answer.targetWord}” correctly and naturally (${ex.title}).`,
          targetWords: ex.answer.targetWord ? [ex.answer.targetWord] : [], learnerAnswer: typed, sourceText: card.ai?.source ?? null, referenceAnswers: card.ai?.reference ?? [],
        },
      });
      setEvaluation({ data: r.evaluation, demo: r.meta.demo });
      setPhase("feedback");
    } catch (e) {
      setEvalError(errorMessage(e));
      setPhase("feedback"); // fall back to self-assessment
    } finally {
      setEvalBusy(false);
    }
  };

  const reviseFree = () => {
    setAttempt((a) => a + 1);
    setEvaluation(null);
    setPhase("answer");
  };

  const finishFree = async (selfRating?: 1 | 2 | 3 | 4) => {
    const real = evaluation && !evaluation.demo;
    const score = real ? evaluation!.data.score : selfRating ? (selfRating - 1) / 3 : 0;
    const outcome: Outcome = score >= 0.75 ? "correct" : score >= 0.45 ? "partial" : "wrong";
    await record(outcome, { score: attempt > 1 ? Math.min(score, 0.7) : score, selfRating: real ? undefined : selfRating, answer: typed });
    next();
  };

  const undo = async () => {
    const last = log[log.length - 1];
    if (!last) return;
    try {
      const pending = await pendingReviews().catch(() => []);
      if (pending.some((p) => p.clientEventId === last.clientEventId)) await removeReview(last.clientEventId);
      else await api("/api/learn/undo", { method: "POST", json: { clientEventId: last.clientEventId } });
      setLog((l) => l.slice(0, -1));
      setResults((r) => r.slice(0, -1));
      const entryId = cards[last.cardIndex]?.exercise.entryId;
      if (entryId) scheduledOnce.current.delete(entryId);
      resetCard();
      setIndex(last.cardIndex);
      toast({ tone: "neutral", text: "Answer undone" });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  // ---------------------------------------------------------------- keyboard & gestures

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ex || done) return;
      const typing = (e.target as HTMLElement)?.tagName === "TEXTAREA" || ((e.target as HTMLElement)?.tagName === "INPUT" && phase === "answer");
      if (ex.answer.type === "self") {
        if ((e.key === " " || e.key === "Enter") && !flipped) { e.preventDefault(); setFlipped(true); return; }
        if (flipped && ["1", "2", "3", "4"].includes(e.key)) { void rateSelf(Number(e.key) as 1 | 2 | 3 | 4); return; }
      }
      if (ex.answer.type === "choice") {
        if (phase === "answer" && /^[1-9]$/.test(e.key) && Number(e.key) <= ex.answer.options.length) pickChoice(Number(e.key) - 1);
        else if (phase === "feedback" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void finishChoice(); }
      }
      if (ex.answer.type === "typed" && phase === "feedback" && e.key === "Enter") { e.preventDefault(); void finishTyped(); }
      if (!typing && e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current || !ex || ex.answer.type !== "self") return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return;
    if (!flipped) { setFlipped(true); return; }
    void rateSelf(dx > 0 ? 3 : 1); // right = Good, left = Again (explained on screen)
  };

  const stats = useMemo(() => {
    const correct = results.filter((r) => ["correct", "alternative", "typo"].includes(r.outcome)).length;
    return { answered: results.length, correct, accuracy: results.length ? Math.round((correct / results.length) * 100) : 0, minutes: Math.round(activeMs / 60000) };
  }, [results, activeMs]);

  const finished = useRef(false);
  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true;
      void flushReviews();
      if (studySessionId) void api("/api/learn/study-session", { method: "POST", json: { op: "end", id: studySessionId, stats } }).catch(() => {});
      onFinish?.(stats);
    }
  }, [done, studySessionId, stats, onFinish]);

  // ---------------------------------------------------------------- render

  if (!cards.length) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="text-xl">Nothing to study right now</h2>
        <p className="mt-2 text-ink-2">No reviews are due and today&apos;s new-word limit is reached (or this selection is empty).</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <LinkButton href="/learn/session?mode=practice" variant="primary">Extra practice</LinkButton>
          <LinkButton href="/vocabulary/import">Import words</LinkButton>
        </div>
      </Card>
    );
  }

  if (done) {
    const missed = results.filter((r) => r.outcome === "wrong" || r.outcome === "revealed");
    const missedIds = [...new Set(missed.map((m) => m.card.exercise.entryId))];
    return (
      <Card className="mx-auto max-w-xl">
        <h2 className="text-2xl">Session complete</h2>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div><dt className="text-xs uppercase text-ink-3">Answers</dt><dd className="font-display text-3xl">{stats.answered}</dd></div>
          <div><dt className="text-xs uppercase text-ink-3">Correct</dt><dd className="font-display text-3xl">{stats.accuracy}%</dd></div>
          <div><dt className="text-xs uppercase text-ink-3">Minutes</dt><dd className="font-display text-3xl">{Math.max(1, stats.minutes)}</dd></div>
        </dl>
        {summaryExtra?.(results)}
        {missed.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-medium text-ink-2">To look at again</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {[...new Map(missed.map((m) => [m.card.exercise.entryId, m.card.exercise.reveal.headword])).entries()].map(([id, w]) => (
                <li key={id}><Link href={`/vocabulary/${id}`} className="rounded-full bg-danger-soft px-3 py-1 text-sm text-danger">{w}</Link></li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-sm text-ink-3">Your answers are saved{typeof navigator !== "undefined" && !navigator.onLine ? " on this device and will sync when you are online" : ""}. Schedules have been updated.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton href="/home" variant="primary">Done</LinkButton>
          {missedIds.length > 0 && <LinkButton href={`/learn/session?mode=practice&ids=${missedIds.join(",")}`}>Practise missed words</LinkButton>}
          <Button variant="ghost" onClick={() => window.location.reload()}><RotateCcw className="size-4" aria-hidden /> Another round</Button>
        </div>
      </Card>
    );
  }

  const progress = (index / cards.length) * 100;
  const r = ex!.reveal;
  const answerType = ex!.answer.type;

  return (
    <div className="mx-auto max-w-2xl" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-ink-3">{index + 1} / {cards.length}</span>
        <div className="flex-1"><Meter value={progress} label="Session progress" /></div>
        {timerSeconds !== undefined && <Badge tone={timeLeft < 10 ? "danger" : "neutral"}>{timeLeft}s</Badge>}
        <Button size="sm" variant="ghost" onClick={undo} disabled={!log.length} title="Undo last answer (Ctrl+Z)" aria-label="Undo last answer"><Undo2 className="size-4" /></Button>
        <LinkButton href="/learn" size="sm" variant="ghost">End</LinkButton>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="navy">{ex!.title}</Badge>
        <Badge>{REASON_TEXT[card.reason] ?? card.reason}</Badge>
        {!card.schedule && <Badge tone="sage" title="Practice only: does not change the review schedule">practice</Badge>}
        <span className="sr-only">{title}</span>
      </div>

      {answerType === "self" && (
        <div className="flip">
          <div className={clsx("flip-inner min-h-[300px]", flipped && "flipped")}>
            <button type="button" onClick={() => setFlipped(true)} aria-label="Show answer"
              className="flip-face flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow)]">
              <span className="font-display text-4xl leading-tight text-ink md:text-5xl">{ex!.prompt}</span>
              {ex!.context && <span className="mt-2 text-sm text-ink-3">{ex!.context}</span>}
              <span className="mt-8 text-sm text-ink-3">Tap, press Space, or swipe to reveal</span>
            </button>
            <div className="flip-face flip-back rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] md:p-8" aria-hidden={!flipped}>
              <RevealBlock ex={ex!} />
            </div>
          </div>
        </div>
      )}

      {answerType !== "self" && (
        <Card className="p-6 md:p-8">
          <div className="text-center">
            <p className={clsx("font-display leading-snug text-ink", ex!.prompt.length > 80 ? "text-xl" : "text-3xl md:text-4xl")}>{ex!.prompt}</p>
            {ex!.context && <p className="mt-2 text-sm text-ink-3">{ex!.context}</p>}
          </div>

          {answerType === "typed" && (
            <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); if (phase === "answer") submitTyped(); else void finishTyped(); }}>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                readOnly={phase === "feedback"}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                aria-label="Your answer"
                placeholder="Type your answer"
                className={clsx("h-14 w-full rounded-xl border-2 bg-surface px-4 text-center font-display text-2xl outline-none",
                  phase === "feedback" && verdict ? (["exact", "alternative"].includes(verdict.kind) ? "border-sage" : verdict.kind === "typo" || verdict.kind === "wrong_form" ? "border-warn" : "border-danger") : "border-line-strong focus:border-navy")}
              />
              {phase === "answer" && (
                <div className="flex flex-wrap justify-center gap-2">
                  {ex!.hint && <Button type="button" variant="ghost" onClick={() => setHints((h) => h + 1)} disabled={hints > 0}><Lightbulb className="size-4" aria-hidden /> {hints ? ex!.hint : "Hint"}</Button>}
                  <Button type="button" variant="ghost" onClick={() => { setVerdict({ kind: "wrong" }); setPhase("feedback"); }}>I don&apos;t know</Button>
                  <Button type="submit" variant="primary">Check</Button>
                </div>
              )}
            </form>
          )}

          {answerType === "choice" && ex!.answer.type === "choice" && (
            <div className="mt-6 grid gap-2">
              {ex!.answer.options.map((o, i) => {
                const correct = ex!.answer.type === "choice" && i === ex!.answer.correct;
                return (
                  <button key={i} type="button" onClick={() => pickChoice(i)} disabled={phase === "feedback"}
                    className={clsx("flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      phase === "feedback" && correct ? "border-sage bg-sage-soft" : phase === "feedback" && choice === i ? "border-danger bg-danger-soft" : "border-line hover:border-navy")}>
                    <kbd className="rounded border border-line px-1.5 text-xs text-ink-3">{i + 1}</kbd>
                    <span>{o}</span>
                    {phase === "feedback" && correct && <Check className="ml-auto size-4 text-sage" aria-label="correct" />}
                    {phase === "feedback" && choice === i && !correct && <X className="ml-auto size-4 text-danger" aria-label="your choice" />}
                  </button>
                );
              })}
            </div>
          )}

          {answerType === "free" && (
            <div className="mt-6 space-y-3">
              <Textarea rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} readOnly={phase === "feedback"} aria-label="Your sentence" placeholder="Write your sentence…" className="font-display text-lg" />
              {phase === "answer" && (
                <div className="flex justify-end gap-2">
                  {attempt > 1 && <span className="self-center text-sm text-ink-3">Revision attempt</span>}
                  <Button variant="primary" onClick={evaluateFree} loading={evalBusy} disabled={!typed.trim()}>Get feedback</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ---------------- feedback panels ---------------- */}
      {answerType === "self" && flipped && (
        <div className="mt-4">
          <p className="mb-2 text-center text-xs text-ink-3">How well did you know it? (keys 1–4 · swipe right = Good, left = Again)</p>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button key={g} type="button" onClick={() => rateSelf(g)} title={RATING_LABELS[g].meaning}
                className={clsx("rounded-xl border px-2 py-3 text-center", g === 1 ? "border-danger/40 hover:bg-danger-soft" : g === 2 ? "border-warn/40 hover:bg-warn-soft" : g === 3 ? "border-sage/40 hover:bg-sage-soft" : "border-navy/40 hover:bg-navy/10")}>
                <span className="block font-medium">{RATING_LABELS[g].label}</span>
                {card.intervals?.[g] && <span className="block text-xs text-ink-3">{card.intervals[g]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {answerType === "typed" && phase === "feedback" && verdict && (
        <Card className="mt-4">
          <p className={clsx("font-medium", ["exact", "alternative"].includes(verdict.kind) ? "text-sage" : verdict.kind === "typo" || verdict.kind === "wrong_form" ? "text-warn" : "text-danger")}>
            {verdictMessage(verdict, ex!.answer.type === "typed" ? ex!.answer.spec.expected[0] : r.headword)}
          </p>
          <RevealBlock ex={ex!} compact />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {(verdict.kind === "wrong" || verdict.kind === "confused") && typed.trim() && ex!.kind !== "cloze" && ex!.kind !== "collocation" && (
                <Button size="sm" variant="ghost" onClick={acceptMine} title="Adds your answer as an accepted alternative for this word">My answer is also correct</Button>
              )}
              <LinkButton size="sm" variant="ghost" href={`/tutor?attach=${ex!.entryId}&ask=${encodeURIComponent(`Explain the nuance of “${r.headword}”${typed ? ` and why “${typed}” does not fit here` : ""}.`)}`}><MessagesSquare className="size-4" aria-hidden /> Explain</LinkButton>
            </div>
            {["exact", "alternative"].includes(verdict.kind) ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => finishTyped(2)}>Hard</Button>
                <Button size="sm" variant="primary" onClick={() => finishTyped(3)}>Good</Button>
                <Button size="sm" onClick={() => finishTyped(4)}>Easy</Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => finishTyped()}>Continue <ChevronRight className="size-4" aria-hidden /></Button>
            )}
          </div>
        </Card>
      )}

      {answerType === "choice" && phase === "feedback" && ex!.answer.type === "choice" && (
        <Card className="mt-4">
          <p className={clsx("font-medium", choice === ex!.answer.correct ? "text-sage" : "text-danger")}>{choice === ex!.answer.correct ? "Correct." : `The best answer: ${ex!.answer.options[ex!.answer.correct]}`}</p>
          {ex!.explanation && <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{ex!.explanation}</p>}
          <RevealBlock ex={ex!} compact />
          <div className="mt-4 flex justify-end"><Button variant="primary" onClick={finishChoice}>Continue <ChevronRight className="size-4" aria-hidden /></Button></div>
        </Card>
      )}

      {answerType === "free" && phase === "feedback" && (
        <Card className="mt-4 space-y-3">
          {evalError && <Notice tone="warn">AI feedback is unavailable ({evalError}). Compare with the model below and rate yourself honestly.</Notice>}
          {evaluation && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={["excellent", "correct"].includes(evaluation.data.verdict) ? "sage" : evaluation.data.verdict === "acceptable" ? "navy" : "warn"}>{evaluation.data.verdict.replace("_", " ")}</Badge>
                {evaluation.demo && <Badge tone="warn">demo check – not AI</Badge>}
              </div>
              <p className="text-ink">{evaluation.data.summary}</p>
              {evaluation.data.issues.length > 0 && (
                <ul className="space-y-2">
                  {evaluation.data.issues.map((i, k) => (
                    <li key={k} className="rounded-lg bg-surface-2 p-3 text-sm">
                      <span className={clsx("mr-2 font-medium", i.severity === "error" ? "text-danger" : i.severity === "unnatural" ? "text-warn" : "text-ink-2")}>
                        {i.severity === "error" ? "Error" : i.severity === "unnatural" ? "Unnatural" : "Suggestion"} · {i.category}
                      </span>
                      <q className="font-display">{i.excerpt}</q> — {i.explanation} {i.severity !== "error" || attempt > 1 ? <em>Try: {i.suggestion}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
              {evaluation.data.hintQuestion && attempt === 1 && !evaluation.demo && evaluation.data.score < 0.75 && (
                <Notice tone="accent" title="Have another go">{evaluation.data.hintQuestion}</Notice>
              )}
              {(attempt > 1 || evaluation.data.score >= 0.75) && evaluation.data.improvedVersion && <p className="text-sm"><span className="text-ink-3">Closer to natural: </span><span className="font-display">{evaluation.data.improvedVersion}</span></p>}
              {evaluation.data.alternatives.length > 0 && <p className="text-sm text-ink-2">Also possible: {evaluation.data.alternatives.join(" · ")}</p>}
            </>
          )}
          <RevealBlock ex={ex!} compact />
          {card.ai?.reference.length ? <p className="text-sm"><span className="text-ink-3">Model: </span><span className="font-display">{card.ai.reference[0]}</span></p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {evaluation && !evaluation.demo && attempt === 1 && evaluation.data.score < 0.75 && <Button onClick={reviseFree}><Edit3 className="size-4" aria-hidden /> Revise my sentence</Button>}
            {evaluation && !evaluation.demo ? (
              <Button variant="primary" onClick={() => finishFree()}>Continue <ChevronRight className="size-4" aria-hidden /></Button>
            ) : (
              GRADES.map((g) => <Button key={g} size="sm" variant={g === 3 ? "primary" : "secondary"} onClick={() => finishFree(g)}>{RATING_LABELS[g].label}</Button>)
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function RevealBlock({ ex, compact }: { ex: Exercise; compact?: boolean }) {
  const r = ex.reveal;
  return (
    <div className={clsx(compact ? "mt-3 border-t border-line pt-3" : "flex min-h-[250px] flex-col justify-center")}>
      <div className="flex items-baseline gap-2">
        <p className={clsx("font-display text-ink", compact ? "text-xl" : "text-3xl")}>{r.headword}</p>
        <button type="button" onClick={() => speak(r.headword)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label={`Pronounce ${r.headword}`}><Volume2 className="size-4" /></button>
        <Link href={`/vocabulary/${ex.entryId}`} target="_blank" className="ml-auto text-xs text-ink-3 underline hover:text-ink">Open / edit word</Link>
      </div>
      {r.translationDe && <p className="mt-1 text-ink-2">{r.translationDe}</p>}
      {r.definitionEn && <p className="mt-1 text-ink-2">{r.definitionEn}</p>}
      {r.example && <p className="mt-2 font-display italic text-ink">“{r.example}”</p>}
      {r.note && <p className="mt-2 text-sm text-ink-3">{r.note}</p>}
    </div>
  );
}
