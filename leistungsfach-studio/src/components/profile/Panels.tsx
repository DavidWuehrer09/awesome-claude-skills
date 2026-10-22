"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MODE_INFO, MODES, TASK_TYPES, TASK_TYPE_KEYS, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import { SKILL_KEYS, SKILLS, type SkillKey } from "@/lib/learner/skills";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle, cx, EmptyState, ErrorNotice, Field, formatDate, Input, Meter, Notice, ProvenanceBadge, Select, Textarea } from "@/components/ui";
import { StartButton } from "@/components/training/GenerateExercise";

// ---------- Skills ----------
export type SkillView = {
  key: string; label: string; description: string; level: number | null; confidence: number; trend: string; masteryStatus: string; masteryLabel: string;
  sourceCount: number; recommendedAction: string;
  evidence: { id: string; sourceType: string; polarity: string; levelEstimate: number | null; quote: string; note: string; essayId: string | null; essayTitle: string | null; dismissedAt: string | null; dismissedReason: string | null; createdAt: string; isTransfer: boolean }[];
};

const statusTone: Record<string, "neutral" | "accent" | "good" | "warn" | "bad"> = {
  not_assessed: "neutral", emerging: "warn", developing: "neutral", recurring_weakness: "bad", improving: "accent", appears_secure_untested: "accent", secure: "good",
};
const trendText: Record<string, string> = { improving: "↗ improving", declining: "↘ declining", stable: "→ stable", insufficient_data: "trend: not enough data" };

export function SkillsPanel({ skills }: { skills: SkillView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteSkill, setNoteSkill] = useState<SkillKey>("analytical_depth");
  const [note, setNote] = useState("");
  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); router.refresh(); } catch (err) { setError(errorMessage(err)); } };

  return (
    <div className="space-y-4">
      <Notice>Levels are estimated only from your own writing and exercise answers (0–15 scale). Confidence grows with the number of independent pieces of work. If something is wrong, remove that piece of evidence and say why — the skill is recalculated immediately.</Notice>
      {error && <ErrorNotice message={error} />}
      <ul className="grid gap-3 md:grid-cols-2">
        {skills.map((s) => (
          <li key={s.key} className={cx("rounded-xl border bg-surface p-4", open === s.key ? "border-accent md:col-span-2" : "border-line")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium text-ink">{s.label}</p><p className="text-xs text-muted">{s.description}</p></div>
              <Badge tone={statusTone[s.masteryStatus] ?? "neutral"}>{s.masteryLabel}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Meter value={s.level} label={`${s.label} estimated level`} />
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink">{s.level === null ? "—" : `${s.level.toFixed(1)}/15`}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Confidence {Math.round(s.confidence * 100)}% · {s.sourceCount} piece{s.sourceCount === 1 ? "" : "s"} of work · {trendText[s.trend] ?? s.trend}</p>
            <p className="mt-2 text-sm text-ink-2"><span className="font-medium text-ink">Next: </span>{s.recommendedAction}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <button className="text-accent underline" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>{open === s.key ? "Hide evidence" : `Evidence (${s.evidence.filter((e) => !e.dismissedAt).length})`}</button>
              <StartButton skillKey={s.key as SkillKey} label="Practise" />
            </div>
            {open === s.key && (
              <div className="mt-3 space-y-2">
                {s.evidence.length === 0 ? <p className="text-sm text-muted">No evidence yet.</p> : s.evidence.map((e) => (
                  <div key={e.id} className={cx("rounded-lg border p-3 text-sm", e.dismissedAt ? "border-dashed border-line opacity-60" : "border-line bg-surface-2/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={e.polarity === "strength" ? "good" : e.polarity === "weakness" ? "bad" : "neutral"}>{e.polarity}</Badge>
                      <Badge>{e.sourceType === "manual_note" ? "your note" : e.sourceType}{e.isTransfer ? " · transfer" : ""}</Badge>
                      {e.levelEstimate !== null && <span className="text-xs text-muted">level {e.levelEstimate}</span>}
                      <span className="text-xs text-muted">{formatDate(e.createdAt)}</span>
                      {e.essayId && e.essayTitle && <Link className="text-xs text-accent underline" href={`/essays/${e.essayId}`}>{e.essayTitle}</Link>}
                    </div>
                    {e.quote && <q className="mt-1 block font-serif italic text-ink-2">{e.quote}</q>}
                    <p className="mt-1 text-ink-2">{e.note}</p>
                    {e.dismissedAt ? (
                      <p className="mt-1 text-xs text-muted">Removed: {e.dismissedReason} · <button className="underline" onClick={() => act(() => api(`/api/learner/evidence/${e.id}/restore`, { body: {} }))}>restore</button></p>
                    ) : (
                      <button className="mt-1 text-xs text-bad underline" onClick={() => {
                        const reason = prompt("Why is this inaccurate? (kept with the record)");
                        if (reason && reason.trim()) act(() => api(`/api/learner/evidence/${e.id}/dismiss`, { body: { reason } }));
                      }}>This is inaccurate — remove</button>
                    )}
                  </div>
                ))}
                <button className="text-xs text-bad underline" onClick={() => { if (confirm(`Reset “${s.label}”? All its evidence and error patterns are set aside (kept in the export, not used).`)) act(() => api(`/api/learner/skills/${s.key}/reset`, { body: {} })); }}>Reset this skill</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Card>
        <CardTitle>Add a note to your profile</CardTitle>
        <p className="mb-3 text-sm text-muted">Context the tutor should know (e.g. “My teacher said my introductions are strong”). Notes inform feedback but never change a level.</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { await api("/api/learner/notes", { body: { skillKey: noteSkill, note } }); setNote(""); }); }}>
          <Field label="Skill" htmlFor="note-skill"><Select id="note-skill" value={noteSkill} onChange={(e) => setNoteSkill(e.target.value as SkillKey)}>{SKILL_KEYS.map((k) => <option key={k} value={k}>{SKILLS[k].label}</option>)}</Select></Field>
          <div className="min-w-[16rem] flex-1"><Field label="Note" htmlFor="note-text"><Input id="note-text" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} /></Field></div>
          <Button type="submit" variant="secondary">Add note</Button>
        </form>
      </Card>
    </div>
  );
}

// ---------- Patterns ----------
export type PatternView = { id: string; label: string; category: string; skillKey: string; status: string; explanation: string; occurrences: { submissionKey: string; quote: string; correction: string; at: string }[]; nextReviewAt: string | null; dismissedAt: string | null; dismissedReason: string | null };
const patternLabel: Record<string, string> = { single: "Seen once", recurring: "Recurring", improving: "Improving", resolved_provisional: "Resolved (provisional)" };
const patternTone: Record<string, "neutral" | "bad" | "accent" | "good"> = { single: "neutral", recurring: "bad", improving: "accent", resolved_provisional: "good" };

export function PatternsPanel({ patterns }: { patterns: PatternView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const live = patterns.filter((p) => !p.dismissedAt);
  if (!patterns.length) return <EmptyState title="No error patterns yet">Patterns are extracted from your assessed essays. A mistake seen once is shown as “seen once”; it only becomes “recurring” when it appears in a second, different piece of work.</EmptyState>;
  return (
    <div className="space-y-3">
      {error && <ErrorNotice message={error} />}
      {live.map((p) => {
        const subs = new Set(p.occurrences.map((o) => o.submissionKey)).size;
        return (
          <div key={p.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium text-ink">{p.label}</p><p className="text-xs text-muted">{SKILLS[p.skillKey as SkillKey]?.label} · {p.category} · in {subs} piece{subs === 1 ? "" : "s"} of work{p.nextReviewAt ? ` · review ${formatDate(p.nextReviewAt)}` : ""}</p></div>
              <Badge tone={patternTone[p.status]}>{patternLabel[p.status] ?? p.status}</Badge>
            </div>
            {p.explanation && <p className="mt-2 text-sm text-ink-2">{p.explanation}</p>}
            <ul className="mt-2 space-y-1 text-sm">{p.occurrences.slice(-3).map((o, i) => <li key={i}><span className="diff-mark diff-removed">{o.quote}</span>{o.correction && <> → <span className="diff-mark diff-added">{o.correction}</span></>}</li>)}</ul>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <StartButton skillKey={p.skillKey as SkillKey} errorPatternId={p.id} label="Targeted exercise" />
              <button className="text-xs text-bad underline" onClick={async () => {
                const reason = prompt("Why should this pattern be removed?");
                if (!reason?.trim()) return;
                try { await api(`/api/learner/patterns/${p.id}/dismiss`, { body: { reason } }); router.refresh(); } catch (err) { setError(errorMessage(err)); }
              }}>Not accurate — remove</button>
            </div>
          </div>
        );
      })}
      {patterns.length > live.length && <p className="text-xs text-muted">{patterns.length - live.length} removed pattern(s) are kept in your data export but no longer used.</p>}
    </div>
  );
}

// ---------- Teacher calibration ----------
export type CalibrationView = {
  pairs: { essayId: string; title: string; taskType: string; teacherScore: number; estimate: number; low: number; high: number; diff: number }[];
  n: number; meanOffset: number; sd: number; withinRange: number; tendency: string; appliedOffset: number; byTaskType: Record<string, { n: number; mean: number }>;
  observations: { id: string; statement: string; category: string; support: number; strength: string; quotes: string[] }[];
};
export type FeedbackView = { id: string; essayId: string | null; teacherScore: number | null; comments: string; criteria: string; analysed: boolean; createdAt: string };

const tendencyText: Record<string, string> = {
  not_enough_data: "Not enough data yet — at least 3 essays need both a teacher score and a teacher-standard estimate.",
  consistent_offset: "Consistent tendency: your teacher's marks differ from the estimates in the same direction.",
  aligned: "The estimates and your teacher's marks agree closely on average.",
  inconsistent: "Inconsistent: the differences vary a lot, so no adjustment is made.",
};

export function TeacherPanel({ cal, feedback }: { cal: CalibrationView; feedback: FeedbackView[] }) {
  const router = useRouter();
  const [criteria, setCriteria] = useState("");
  const [comments, setComments] = useState("");
  const [taskType, setTaskType] = useState<TaskTypeKey | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(null); try { await fn(); router.refresh(); } catch (err) { setError(errorMessage(err)); } setBusy(null); };
  return (
    <div className="space-y-5">
      <Notice tone="accent">Teacher calibration is <strong>specific to your teacher</strong>. It adjusts the teacher-standard estimate only when there is enough consistent evidence, and it is never treated as an official Bavarian rule.</Notice>
      {error && <ErrorNotice message={error} />}
      <Card>
        <CardTitle>Calibration status</CardTitle>
        <p className="text-ink-2">{tendencyText[cal.tendency]}</p>
        {cal.n > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted">Essays compared</dt><dd className="text-lg font-semibold tabular-nums">{cal.n}</dd></div>
            <div><dt className="text-muted">Mean difference</dt><dd className="text-lg font-semibold tabular-nums">{cal.meanOffset > 0 ? "+" : ""}{cal.meanOffset}</dd></div>
            <div><dt className="text-muted">Spread (SD)</dt><dd className="text-lg font-semibold tabular-nums">{cal.sd}</dd></div>
            <div><dt className="text-muted">Teacher mark within range</dt><dd className="text-lg font-semibold tabular-nums">{cal.withinRange}/{cal.n}</dd></div>
          </dl>
        )}
        {cal.appliedOffset !== 0 && <p className="mt-3 text-sm text-ink-2">Teacher-standard estimates now also show a calibrated range shifted by {cal.appliedOffset > 0 ? "+" : ""}{cal.appliedOffset}.</p>}
        {cal.pairs.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Teacher marks compared with estimates</caption>
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Essay</th><th>Task type</th><th>Estimate</th><th>Teacher</th><th>Difference</th></tr></thead>
              <tbody>{cal.pairs.map((p) => (
                <tr key={p.essayId} className="border-t border-line"><td className="py-2"><Link className="text-accent underline" href={`/essays/${p.essayId}`}>{p.title}</Link></td><td>{TASK_TYPES[p.taskType as TaskTypeKey]?.label ?? p.taskType}</td><td className="tabular-nums">{p.low}–{p.high}</td><td className="tabular-nums">{p.teacherScore}</td><td className="tabular-nums">{p.diff > 0 ? "+" : ""}{p.diff}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>Your teacher&apos;s expectations (extracted from feedback)</CardTitle>
        {cal.observations.length === 0 ? <p className="text-sm text-muted">None yet. Enter teacher comments or a marking scheme and analyse them.</p> : (
          <ul className="space-y-2">{cal.observations.map((o) => (
            <li key={o.id} className="rounded-lg bg-surface-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{o.statement}</span><Badge tone={o.support >= 2 ? "accent" : "neutral"}>{o.strength}</Badge><ProvenanceBadge p="teacher_specific" /></div>
              {o.quotes[0] && <q className="mt-1 block italic text-ink-2">{o.quotes[0]}</q>}
              <button className="mt-1 text-xs text-bad underline" onClick={() => run(`o${o.id}`, () => api(`/api/teacher-observations/${o.id}`, { method: "DELETE" }))}>Remove</button>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card>
        <CardTitle>Add a general marking scheme or feedback</CardTitle>
        <p className="mb-3 text-sm text-muted">For feedback on a specific essay, use the form on that essay&apos;s page so the score can be compared.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run("new", async () => {
          const fb = await api<{ id: string }>("/api/teacher-feedback", { body: { criteria, comments, taskType: taskType || null } });
          await api(`/api/teacher-feedback/${fb.id}/analyse`, { body: {} });
          setCriteria(""); setComments("");
        }); }}>
          <Field label="Task type it applies to" htmlFor="tf-type" optional><Select id="tf-type" value={taskType} onChange={(e) => setTaskType(e.target.value as TaskTypeKey | "")}><option value="">All / unspecified</option>{TASK_TYPE_KEYS.map((k) => <option key={k} value={k}>{TASK_TYPES[k].label}</option>)}</Select></Field>
          <Field label="Marking criteria" htmlFor="tf-criteria" optional><Textarea id="tf-criteria" rows={4} value={criteria} onChange={(e) => setCriteria(e.target.value)} /></Field>
          <Field label="Comments" htmlFor="tf-comments" optional><Textarea id="tf-comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
          <Button type="submit" loading={busy === "new"} disabled={!criteria.trim() && !comments.trim()}>Save and analyse</Button>
        </form>
      </Card>
      {feedback.length > 0 && (
        <Card>
          <CardTitle>All teacher feedback</CardTitle>
          <ul className="divide-y divide-line text-sm">{feedback.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink">{f.teacherScore !== null && <strong>{f.teacherScore}/15 · </strong>}{(f.comments || f.criteria).slice(0, 160) || <em>score only</em>}</p>
                <p className="text-xs text-muted">{formatDate(f.createdAt)}{f.essayId && <> · <Link className="underline" href={`/essays/${f.essayId}`}>essay</Link></>}</p>
              </div>
              <div className="flex gap-3">
                {!f.analysed && (f.comments || f.criteria) && <button className="text-xs text-accent underline" disabled={busy !== null} onClick={() => run(`a${f.id}`, () => api(`/api/teacher-feedback/${f.id}/analyse`, { body: {} }))}>{busy === `a${f.id}` ? "Analysing…" : "Analyse"}</button>}
                <button className="text-xs text-bad underline" onClick={() => { if (confirm("Delete this feedback?")) run(`d${f.id}`, () => api(`/api/teacher-feedback/${f.id}`, { method: "DELETE" })); }}>Delete</button>
              </div>
            </li>
          ))}</ul>
        </Card>
      )}
    </div>
  );
}

// ---------- Curriculum ----------
export type RequirementView = { id: string; area: string; statement: string; provenance: string; sources: string[] };
export type SourceView = { id: string; title: string; url: string; publisher: string; usedFor: string };
export type NoteView = { id: string; sourceId: string | null; title: string; url: string; passage: string; appliesTo: string; createdAt: string };

export function CurriculumPanel({ requirements, sources, notes, limitation, assessmentRule, abiturNotes }: { requirements: RequirementView[]; sources: SourceView[]; notes: NoteView[]; limitation: string; assessmentRule: string; abiturNotes: string[] }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [passage, setPassage] = useState("");
  const [appliesTo, setAppliesTo] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <Notice tone="warn"><strong>Research limitation.</strong> {limitation}</Notice>
      <Card>
        <CardTitle>Requirements the tutor uses</CardTitle>
        <ul className="space-y-3">{requirements.map((r) => (
          <li key={r.id} className="text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{r.area}</span><ProvenanceBadge p={r.provenance} /><span className="text-xs text-muted">{r.sources.join(", ")}</span></div><p className="mt-1 text-ink-2">{r.statement}</p></li>
        ))}
          <li className="text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">Scoring</span><ProvenanceBadge p="official_reported" /></div><p className="mt-1 text-ink-2">{assessmentRule}</p></li>
          {abiturNotes.map((n) => <li key={n} className="text-sm text-ink-2">• {n}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">Operator explanations, dimension weights and band descriptors are labelled “interpretation”: sound educational practice, not official wording.</p>
      </Card>
      <Card>
        <CardTitle>Official sources</CardTitle>
        <ul className="space-y-2 text-sm">{sources.map((s) => (
          <li key={s.id}><span className="mr-2 font-mono text-xs text-muted">{s.id}</span><a className="text-accent underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> <span className="text-muted">— {s.publisher}; used for: {s.usedFor}</span></li>
        ))}</ul>
      </Card>
      <Card>
        <CardTitle>Passages you verified</CardTitle>
        <p className="mb-3 text-sm text-muted">Open an official source, read it, and paste the relevant passage here (e.g. the Kompetenzerwartungen for writing, the Themengebiete, the 2027 operator list, the current Bewertungsraster). Verified passages are given to the tutor as “official (verified)” and take precedence over reported guidance.</p>
        {notes.length > 0 && (
          <ul className="mb-4 space-y-2">{notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-surface-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{n.title}</span><ProvenanceBadge p="official_verified" /><span className="text-xs text-muted">applies to: {n.appliesTo === "all" ? "all tasks" : TASK_TYPES[n.appliesTo as TaskTypeKey]?.label}</span></div>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-ink-2">{n.passage}</p>
              <button className="mt-1 text-xs text-bad underline" onClick={async () => { if (!confirm("Delete this passage?")) return; try { await api(`/api/curriculum-notes/${n.id}`, { method: "DELETE" }); router.refresh(); } catch (err) { setError(errorMessage(err)); } }}>Delete</button>
            </li>
          ))}</ul>
        )}
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { await api("/api/curriculum-notes", { body: { sourceId: sourceId || null, title, url, passage, appliesTo } }); setTitle(""); setUrl(""); setPassage(""); router.refresh(); }
          catch (err) { setError(errorMessage(err)); }
          setBusy(false);
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source" htmlFor="cn-src"><Select id="cn-src" value={sourceId} onChange={(e) => { setSourceId(e.target.value); const s = sources.find((x) => x.id === e.target.value); if (s) { setTitle(s.title); setUrl(s.url); } }}><option value="">Other official document</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.title}</option>)}</Select></Field>
            <Field label="Applies to" htmlFor="cn-applies"><Select id="cn-applies" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}><option value="all">All tasks</option>{TASK_TYPE_KEYS.map((k) => <option key={k} value={k}>{TASK_TYPES[k].label}</option>)}</Select></Field>
          </div>
          <Field label="Title" htmlFor="cn-title"><Input id="cn-title" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <Field label="URL" htmlFor="cn-url" optional><Input id="cn-url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Passage (copied from the document)" htmlFor="cn-passage"><Textarea id="cn-passage" rows={6} value={passage} onChange={(e) => setPassage(e.target.value)} required /></Field>
          {error && <ErrorNotice message={error} />}
          <Button type="submit" loading={busy}>I read this in the official document — save</Button>
        </form>
      </Card>
    </div>
  );
}

// ---------- Settings & data ----------
export type ProfileView = { displayName: string; yearLevel: number; targetPoints: number; defaultMode: string; useReportedWeighting: boolean; goals: string };

export function SettingsPanel({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardTitle>Settings</CardTitle>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        try { await api("/api/profile", { method: "PATCH", body: p }); setMsg({ ok: true, text: "Saved." }); router.refresh(); } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
        setBusy(false);
      }}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="s-name" optional><Input id="s-name" value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} /></Field>
          <Field label="Jahrgangsstufe" htmlFor="s-year"><Select id="s-year" value={p.yearLevel} onChange={(e) => setP({ ...p, yearLevel: Number(e.target.value) })}>{[11, 12, 13].map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
          <Field label="Default assessment mode" htmlFor="s-mode"><Select id="s-mode" value={p.defaultMode} onChange={(e) => setP({ ...p, defaultMode: e.target.value })}>{MODES.map((m) => <option key={m} value={m}>{MODE_INFO[m as AssessmentMode].label}</option>)}</Select></Field>
        </div>
        <Field label="Your goals" htmlFor="s-goals" optional hint="e.g. “Reach 13+ in analysis tasks before the Abitur”."><Textarea id="s-goals" rows={2} value={p.goals} onChange={(e) => setP({ ...p, goals: e.target.value })} /></Field>
        <label className="flex items-start gap-3 rounded-lg border border-line p-3">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={p.useReportedWeighting} onChange={(e) => setP({ ...p, useReportedWeighting: e.target.checked })} />
          <span className="text-sm"><span className="font-medium text-ink">Use the reported 40 % content / 60 % language weighting</span> <ProvenanceBadge p="official_reported" /><br /><span className="text-muted">Reported for the Bavarian KMS on written exam formats, including the rule that content below 3 points caps a task at 3. Not verified in this build. Switch off to combine content and language equally.</span></span>
        </label>
        {msg && <p className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p>}
        <Button type="submit" loading={busy}>Save settings</Button>
      </form>
    </Card>
  );
}

export type AiRunView = { id: string; operation: string; status: string; errorCode: string | null; provider: string; model: string | null; durationMs: number | null; attempts: number; inputTokens: number | null; outputTokens: number | null; createdAt: string };

export function DataPanel({ ai, runs, db }: { ai: { provider: string; configured: boolean; model: string }; runs: AiRunView[]; db: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Your data</CardTitle>
        <p className="text-sm text-ink-2">Your essays, scores and profile are stored in this app&apos;s own database ({db === "pglite" ? "a local database folder on this computer" : "your PostgreSQL database"}). Essay text is sent only to the Anthropic API for assessment. Nothing is shared with other services.</p>
        <a href="/api/export" className="mt-3 inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-ink hover:bg-surface-2">Download everything (JSON)</a>
      </Card>
      <Card>
        <CardTitle>AI tutor status</CardTitle>
        <p className="text-sm text-ink-2">Provider: <strong>{ai.provider}</strong> · model: <strong>{ai.model}</strong> · {ai.configured ? <span className="text-good">configured</span> : <span className="text-bad">not configured — add ANTHROPIC_API_KEY to .env.local</span>}</p>
        {runs.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <caption className="sr-only">Recent AI requests</caption>
              <thead className="uppercase text-muted"><tr><th className="py-1.5">When</th><th>Operation</th><th>Result</th><th>Attempts</th><th>Time</th><th>Tokens in/out</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id} className="border-t border-line"><td className="py-1.5">{new Date(r.createdAt).toLocaleString("en-GB")}</td><td>{r.operation}</td><td className={r.status === "ok" ? "text-good" : "text-bad"}>{r.status === "ok" ? "ok" : r.errorCode}</td><td>{r.attempts}</td><td>{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)} s` : "—"}</td><td>{r.inputTokens ?? "—"} / {r.outputTokens ?? "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="border-bad/30">
        <CardTitle>Delete everything</CardTitle>
        <p className="text-sm text-ink-2">Permanently deletes all essays, assessments, revisions, exercises, vocabulary, teacher feedback and your learner profile. Download an export first. Type <strong>DELETE ALL MY DATA</strong> to confirm.</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault(); setMsg(null);
          try {
            await api("/api/reset", { body: { confirmation: confirmText } });
            // Full reload: every page's cached data is now stale.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/";
          } catch (err) { setMsg(errorMessage(err)); }
        }}>
          <label htmlFor="reset-confirm" className="sr-only">Confirmation</label>
          <Input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="max-w-xs" autoComplete="off" />
          <Button type="submit" variant="danger" disabled={confirmText !== "DELETE ALL MY DATA"}>Delete all data</Button>
        </form>
        {msg && <p className="mt-2 text-sm text-bad">{msg}</p>}
      </Card>
    </div>
  );
}
