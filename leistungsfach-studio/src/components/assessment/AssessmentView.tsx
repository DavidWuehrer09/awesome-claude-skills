"use client";
import Link from "next/link";
import { useState } from "react";
import { DIMENSIONS, MODE_INFO, bandFor, gradeLabel, type AssessmentMode, type DimensionKey } from "@/lib/curriculum";
import type { AssessmentOutput } from "@/lib/ai/schemas";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle, cx, ErrorNotice, formatDate, MockBadge, Notice, ScoreRange } from "@/components/ui";

export type AssessmentRow = {
  id: string; mode: string; status: string; errorCode: string | null; errorMessage: string | null;
  scoreLow: number | null; scoreHigh: number | null; scoreBest: number | null; contentScore: number | null; languageScore: number | null;
  confidence: string | null; aggregation: unknown; result: unknown; calibration: unknown; provider: string | null; model: string | null; promptVersion: string | null; createdAt: string;
};

type Agg = { method: string; notes: string[]; warnings?: string[]; capApplied: boolean; content: { low: number; best: number; high: number } | null; language: { low: number; best: number; high: number } | null };
type Calib = { n: number; offset: number; low?: number; high?: number; best?: number; note: string; tendency?: string } | null;

const confTone = { low: "warn", medium: "neutral", high: "good" } as const;

function DimensionRow({ d }: { d: AssessmentOutput["dimensions"][number] }) {
  const [open, setOpen] = useState(false);
  const info = DIMENSIONS[d.key as DimensionKey];
  return (
    <li className="border-b border-line py-3 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{info?.label ?? d.key}</span>
          <span className="block text-xs text-muted">{info?.group === "language" ? "Language" : "Content & structure"}</span>
        </span>
        <span className="relative hidden h-2 w-40 rounded-full bg-surface-2 sm:block" aria-hidden>
          <span className="absolute h-2 rounded-full bg-accent/35" style={{ left: `${(d.low / 15) * 100}%`, width: `${Math.max(2, ((d.high - d.low) / 15) * 100)}%` }} />
          <span className="absolute top-[-3px] h-3.5 w-1 rounded bg-accent" style={{ left: `calc(${(d.best / 15) * 100}% - 2px)` }} />
        </span>
        <ScoreRange low={d.low} high={d.high} best={d.best} size="sm" />
        <span className="text-xs text-muted">{open ? "Hide" : "Why?"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
          <p>{d.rationale}</p>
          {d.evidence.length > 0 && (
            <ul className="space-y-1.5">
              {d.evidence.map((e, i) => <li key={i}><q className="font-serif italic text-ink">{e.quote}</q> — {e.comment}</li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function AssessmentView({ a, essayId }: { a: AssessmentRow; essayId: string }) {
  const [vocabAdded, setVocabAdded] = useState<Record<number, string>>({});
  const [retry, setRetry] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });

  if (a.status !== "completed") {
    return (
      <ErrorNotice
        title={`Assessment failed (${MODE_INFO[a.mode as AssessmentMode]?.label ?? a.mode}, ${formatDate(a.createdAt)})`}
        message={a.errorMessage ?? "Unknown error."}
      />
    );
  }
  const r = a.result as AssessmentOutput;
  const agg = a.aggregation as Agg;
  const cal = a.calibration as Calib;
  const band = bandFor(a.scoreBest ?? 0);
  const majors = r.weaknesses.filter((w) => w.severity === "major");
  const minors = r.weaknesses.filter((w) => w.severity === "minor");

  return (
    <div className="space-y-5">
      <Card className="border-accent/25">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Estimated score · {MODE_INFO[a.mode as AssessmentMode]?.label} mode</p>
            <div className="mt-1 flex items-baseline gap-3">
              <ScoreRange low={a.scoreLow} high={a.scoreHigh} best={a.scoreBest} size="lg" />
              <span className="text-sm text-muted">most likely {a.scoreBest} ({gradeLabel(a.scoreBest ?? 0)}) · {band.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={confTone[(a.confidence ?? "medium") as keyof typeof confTone]}>Confidence: {a.confidence}</Badge>
              {agg.content && <Badge>Content & structure ≈ {agg.content.best}</Badge>}
              {agg.language && <Badge>Language ≈ {agg.language.best}</Badge>}
              {agg.capApplied && <Badge tone="warn">Content cap applied</Badge>}
              <MockBadge provider={a.provider} />
            </div>
          </div>
          {cal && cal.offset !== 0 && cal.low !== undefined && (
            <div className="rounded-lg border border-accent/25 bg-accent-soft p-3 text-sm">
              <p className="font-medium text-accent">Calibrated to your teacher</p>
              <p className="mt-1"><ScoreRange low={cal.low ?? null} high={cal.high ?? null} best={cal.best} /></p>
              <p className="mt-1 max-w-xs text-xs text-ink-2">{cal.note}</p>
            </div>
          )}
        </div>
        <p className="mt-4 leading-relaxed text-ink-2">{r.overall_comment}</p>
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer select-none">How this estimate was calculated</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The examiner rated each criterion separately, quoting your text; the app combined the ratings deterministically.</li>
            {agg.notes.map((n) => <li key={n}>{n}</li>)}
            {cal && cal.offset === 0 && <li>{cal.note}</li>}
            {(agg.warnings ?? []).map((w) => <li key={w} className="text-warn">{w}</li>)}
            <li>Task understanding: {r.task_understanding}</li>
            <li>Model: {a.model ?? "—"} · instructions {a.promptVersion} · {formatDate(a.createdAt)}</li>
          </ul>
        </details>
        {r.uncertainty_notes.length > 0 && <div className="mt-3"><Notice tone="warn"><p className="font-medium">Uncertainty</p><ul className="mt-1 list-disc pl-5">{r.uncertainty_notes.map((u) => <li key={u}>{u}</li>)}</ul></Notice></div>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Strongest aspects</CardTitle>
          <ul className="space-y-3">
            {r.strengths.map((s, i) => (
              <li key={i} className="rounded-lg border border-good/25 bg-good-soft/60 p-3">
                <p className="font-medium text-ink">{s.title}</p>
                <q className="mt-1 block font-serif italic text-ink-2">{s.quote}</q>
                <p className="mt-1 text-sm text-ink-2">{s.why_it_works}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Prioritised action plan</CardTitle>
          <ol className="space-y-3">
            {[...r.action_plan].sort((x, y) => x.priority - y.priority).map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">{i + 1}</span>
                <div>
                  <p className="text-ink">{p.action}</p>
                  <p className="mt-0.5 text-xs text-muted">{SKILLS[p.skill_key as SkillKey]?.label} · {p.why}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/training?from=${essayId}`} className="text-sm font-medium text-accent underline">Practise these in Personal Training →</Link>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle aside={<span className="text-xs text-muted">Most consequential first</span>}>Weaknesses</CardTitle>
        {majors.length > 0 && <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-bad">Major — conceptual or task-level</h3>}
        <ul className="space-y-3">
          {majors.map((w, i) => <WeaknessItem key={`M${i}`} w={w} />)}
        </ul>
        {minors.length > 0 && <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-muted">Minor — local language</h3>}
        <ul className="space-y-3">
          {minors.map((w, i) => <WeaknessItem key={`m${i}`} w={w} />)}
        </ul>
        {r.weaknesses.length === 0 && <p className="text-sm text-muted">No weaknesses were identified.</p>}
      </Card>

      <Card>
        <CardTitle>Assessment by criterion</CardTitle>
        <ul>{r.dimensions.map((d) => <DimensionRow key={d.key} d={d} />)}</ul>
      </Card>

      {(r.vocabulary_suggestions.length > 0 || r.curriculum_references.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {r.vocabulary_suggestions.length > 0 && (
            <Card>
              <CardTitle>Expressions that would have helped</CardTitle>
              <ul className="space-y-3">
                {r.vocabulary_suggestions.map((v, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{v.term} <span className="font-normal text-muted">— {v.meaning}</span></p>
                      <p className="text-sm italic text-ink-2">{v.example}</p>
                      <p className="text-xs text-muted">{v.why_useful}</p>
                    </div>
                    {vocabAdded[i] ? <Badge tone="good">{vocabAdded[i]}</Badge> : (
                      <Button size="sm" variant="secondary" onClick={async () => {
                        try { await api("/api/vocab/from-assessment", { body: { assessmentId: a.id, index: i } }); setVocabAdded((x) => ({ ...x, [i]: "Added" })); }
                        catch (err) { setVocabAdded((x) => ({ ...x, [i]: errorMessage(err).includes("already") ? "Already saved" : "Failed" })); }
                      }}>Add to bank</Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {r.curriculum_references.length > 0 && (
            <Card>
              <CardTitle>Curriculum expectations applied</CardTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{r.curriculum_references.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="mt-3 text-xs text-muted">See Learner Profile → Curriculum sources for the evidence status of each requirement.</p>
            </Card>
          )}
        </div>
      )}

      <div className="text-sm text-muted">
        Learner profile not updated from this assessment?{" "}
        <button className="underline" disabled={retry.busy} onClick={async () => {
          setRetry({ busy: true, msg: null });
          try { await api(`/api/assessments/${a.id}/learner-update`, { body: {} }); setRetry({ busy: false, msg: "Learner profile updated." }); }
          catch (err) { setRetry({ busy: false, msg: errorMessage(err) }); }
        }}>{retry.busy ? "Updating…" : "Retry the profile update"}</button>
        {retry.msg && <span className={cx("ml-2", retry.msg.includes("updated") ? "text-good" : "text-bad")}>{retry.msg}</span>}
      </div>
    </div>
  );
}

function WeaknessItem({ w }: { w: AssessmentOutput["weaknesses"][number] }) {
  return (
    <li className={cx("rounded-lg border p-3", w.severity === "major" ? "border-bad/25 bg-bad-soft/50" : "border-line bg-surface-2/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-ink">{w.title}</p>
        <Badge tone={w.severity === "major" ? "bad" : "neutral"}>{w.severity}</Badge>
        <Badge>{DIMENSIONS[w.dimension as DimensionKey]?.label ?? w.dimension}</Badge>
      </div>
      <ul className="mt-2 space-y-1">{w.quotes.map((q, i) => <li key={i}><q className="font-serif italic text-ink-2">{q}</q></li>)}</ul>
      <p className="mt-2 text-sm text-ink-2"><span className="font-medium text-ink">Why it weakens the essay: </span>{w.explanation} {w.why_it_matters}</p>
      <p className="mt-1 text-sm text-ink-2"><span className="font-medium text-ink">How to fix it: </span>{w.how_to_fix}</p>
    </li>
  );
}
