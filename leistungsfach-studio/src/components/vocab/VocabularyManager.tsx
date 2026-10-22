"use client";
import { useMemo, useState } from "react";
import type { VocabUseOutput } from "@/lib/ai/schemas";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle, cx, EmptyState, ErrorNotice, Field, formatDate, Input, LoadingNotice, Notice, Select, Textarea } from "@/components/ui";

export type VocabEntry = {
  id: string; term: string; meaning: string; collocations: string[]; register: string; example: string; pitfalls: string; topic: string;
  sourceType: string; status: string; correctUses: number; attempts: number; reviewIntervalDays: number; nextReviewAt: string | null; createdAt: string;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "good" | "warn" }> = {
  new: { label: "New", tone: "neutral" },
  recognised: { label: "Recognised", tone: "accent" },
  used_correctly: { label: "Used correctly", tone: "good" },
  secure: { label: "Secure", tone: "good" },
};

const EMPTY = { term: "", meaning: "", collocations: "", register: "neutral", example: "", pitfalls: "", topic: "" };

function EntryForm({ initial, onSaved, onCancel }: { initial?: VocabEntry; onSaved: (v: VocabEntry) => void; onCancel?: () => void }) {
  const [f, setF] = useState(initial ? { ...initial, collocations: initial.collocations.join(", ") } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));
  const idp = initial ? `e-${initial.id}` : "new";
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      const body = { term: f.term, meaning: f.meaning, collocations: f.collocations.split(",").map((s) => s.trim()).filter(Boolean), register: f.register, example: f.example, pitfalls: f.pitfalls, topic: f.topic };
      try {
        const v = initial ? await api<VocabEntry>(`/api/vocab/${initial.id}`, { method: "PATCH", body }) : await api<VocabEntry>("/api/vocab", { body });
        onSaved(v); if (!initial) setF(EMPTY);
      } catch (err) { setError(errorMessage(err)); }
      setBusy(false);
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Word or expression" htmlFor={`${idp}-term`}><Input id={`${idp}-term`} value={f.term} onChange={(e) => set("term", e.target.value)} required /></Field>
        <Field label="Register" htmlFor={`${idp}-reg`}>
          <Select id={`${idp}-reg`} value={f.register} onChange={(e) => set("register", e.target.value)}>{["formal", "neutral", "informal", "academic"].map((r) => <option key={r}>{r}</option>)}</Select>
        </Field>
      </div>
      <Field label="Meaning in context" htmlFor={`${idp}-meaning`}><Input id={`${idp}-meaning`} value={f.meaning} onChange={(e) => set("meaning", e.target.value)} /></Field>
      <Field label="Natural collocations" htmlFor={`${idp}-col`} optional hint="Comma-separated, e.g. underscore the need, underscore the importance"><Input id={`${idp}-col`} value={f.collocations} onChange={(e) => set("collocations", e.target.value)} /></Field>
      <Field label="Example sentence" htmlFor={`${idp}-ex`} optional><Textarea id={`${idp}-ex`} rows={2} value={f.example} onChange={(e) => set("example", e.target.value)} /></Field>
      <Field label="Common mistakes / inappropriate uses" htmlFor={`${idp}-pit`} optional><Input id={`${idp}-pit`} value={f.pitfalls} onChange={(e) => set("pitfalls", e.target.value)} /></Field>
      <Field label="Topic" htmlFor={`${idp}-topic`} optional><Input id={`${idp}-topic`} value={f.topic} onChange={(e) => set("topic", e.target.value)} /></Field>
      {error && <ErrorNotice message={error} />}
      <div className="flex gap-2"><Button type="submit" loading={busy}>{initial ? "Save" : "Add to bank"}</Button>{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}</div>
    </form>
  );
}

function ReviewSession({ due, onUpdated, onClose }: { due: VocabEntry[]; onUpdated: (v: VocabEntry) => void; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<"recall" | "recall-result" | "use" | "use-result">("recall");
  const [response, setResponse] = useState("");
  const [recall, setRecall] = useState<{ outcome: string; expected: string } | null>(null);
  const [use, setUse] = useState<{ outcome: string; feedback: VocabUseOutput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = due[idx];
  if (!e) return <Card><CardTitle>Review complete</CardTitle><p className="text-sm text-muted">You reviewed {due.length} item{due.length === 1 ? "" : "s"}. They are rescheduled based on your answers.</p><Button className="mt-3" variant="secondary" onClick={onClose}>Close</Button></Card>;
  const next = () => { setIdx(idx + 1); setStep("recall"); setResponse(""); setRecall(null); setUse(null); setError(null); };
  const outcomeTone = (o: string) => (o === "correct" ? "good" : o === "partial" ? "warn" : "bad");
  return (
    <Card className="border-accent/30">
      <CardTitle aside={<span className="text-xs text-muted">{idx + 1} / {due.length}</span>}>Review</CardTitle>
      {(step === "recall" || step === "recall-result") && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Which expression means:</p>
          <p className="font-serif text-lg text-ink">{e.meaning || "(no meaning saved — recall from the hint)"}</p>
          {e.collocations.length > 0 && <p className="text-sm text-muted">Hint: starts with “{e.term.charAt(0)}”, used like “{e.collocations[0].replace(new RegExp(e.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "___")}”</p>}
          {step === "recall" ? (
            <form className="flex flex-wrap gap-2" onSubmit={async (ev) => {
              ev.preventDefault(); setBusy(true); setError(null);
              try { const r = await api<{ entry: VocabEntry; outcome: string; expected: string }>(`/api/vocab/${e.id}/recall`, { body: { response } }); setRecall(r); onUpdated(r.entry); setStep("recall-result"); }
              catch (err) { setError(errorMessage(err)); }
              setBusy(false);
            }}>
              <label htmlFor="recall" className="sr-only">Your answer</label>
              <Input id="recall" value={response} onChange={(ev) => setResponse(ev.target.value)} className="max-w-xs" autoFocus />
              <Button type="submit" loading={busy}>Check</Button>
            </form>
          ) : recall && (
            <div className="space-y-3">
              <p><Badge tone={outcomeTone(recall.outcome)}>{recall.outcome}</Badge> <span className="ml-2 text-ink">{recall.expected}</span></p>
              <div className="flex gap-2"><Button onClick={() => { setStep("use"); setResponse(""); }}>Now use it in a sentence</Button><Button variant="ghost" onClick={next}>Skip</Button></div>
            </div>
          )}
        </div>
      )}
      {(step === "use" || step === "use-result") && (
        <div className="space-y-3">
          <p className="text-ink">Write an original sentence using <strong>{e.term}</strong>{e.topic ? ` (topic: ${e.topic})` : ""}.</p>
          {step === "use" ? (
            <form className="space-y-2" onSubmit={async (ev) => {
              ev.preventDefault(); setBusy(true); setError(null);
              try { const r = await api<{ entry: VocabEntry; outcome: string; feedback: VocabUseOutput }>(`/api/vocab/${e.id}/use`, { body: { sentence: response } }); setUse(r); onUpdated(r.entry); setStep("use-result"); }
              catch (err) { setError(errorMessage(err)); }
              setBusy(false);
            }}>
              <label htmlFor="use" className="sr-only">Your sentence</label>
              <Textarea id="use" rows={2} value={response} onChange={(ev) => setResponse(ev.target.value)} autoFocus />
              {busy && <LoadingNotice title="Checking your sentence…" />}
              <Button type="submit" loading={busy} disabled={response.trim().length < 3}>Check sentence</Button>
            </form>
          ) : use && (
            <div className="space-y-2 text-sm">
              <p><Badge tone={outcomeTone(use.outcome)}>{use.outcome}</Badge></p>
              <p className="text-ink-2">{use.feedback.feedback}</p>
              {use.feedback.corrected_sentence && <p className="font-serif text-ink">→ {use.feedback.corrected_sentence}</p>}
              <Button onClick={next}>Next</Button>
            </div>
          )}
        </div>
      )}
      {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
    </Card>
  );
}

export function VocabularyManager({ initial }: { initial: VocabEntry[] }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<VocabEntry[] | null>(null);
  const [now] = useState(() => Date.now());
  const due = items.filter((v) => v.nextReviewAt && new Date(v.nextReviewAt).getTime() <= now);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((v) => (!status || v.status === status) && (!s || [v.term, v.meaning, v.topic, v.collocations.join(" "), v.example].join(" ").toLowerCase().includes(s)));
  }, [items, q, status]);
  const upsert = (v: VocabEntry) => setItems((xs) => (xs.some((x) => x.id === v.id) ? xs.map((x) => (x.id === v.id ? v : x)) : [v, ...xs]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {reviewing ? <ReviewSession due={reviewing} onUpdated={upsert} onClose={() => setReviewing(null)} /> : due.length > 0 && (
          <Notice tone="accent">
            <span className="flex flex-wrap items-center justify-between gap-2"><span><strong>{due.length}</strong> item{due.length === 1 ? " is" : "s are"} due for review.</span><Button size="sm" onClick={() => setReviewing(due.slice(0, 15))}>Start review</Button></span>
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <label htmlFor="vsearch" className="sr-only">Search vocabulary</label>
          <Input id="vsearch" type="search" placeholder="Search words, meanings, topics…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <label htmlFor="vstatus" className="sr-only">Filter by status</label>
          <Select id="vstatus" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {items.length === 0 ? (
          <EmptyState title="Your vocabulary bank is empty">Add expressions on the right, or save the suggestions that appear in your essay assessments.</EmptyState>
        ) : filtered.length === 0 ? <p className="text-sm text-muted">No entries match.</p> : (
          <ul className="space-y-3">
            {filtered.map((v) => (
              <li key={v.id} className="rounded-xl border border-line bg-surface p-4">
                {editing === v.id ? <EntryForm initial={v} onSaved={(x) => { upsert(x); setEditing(null); }} onCancel={() => setEditing(null)} /> : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-lg font-semibold text-ink">{v.term} <span className="ml-1 align-middle text-xs font-normal text-muted">{v.register}</span></p>
                      {v.meaning && <p className="text-ink-2">{v.meaning}</p>}
                      {v.collocations.length > 0 && <p className="mt-1 text-sm text-ink-2"><span className="text-muted">Collocations: </span>{v.collocations.join(" · ")}</p>}
                      {v.example && <p className="mt-1 text-sm italic text-ink-2">{v.example}</p>}
                      {v.pitfalls && <p className="mt-1 text-sm text-bad">Avoid: {v.pitfalls}</p>}
                      <p className="mt-2 text-xs text-muted">Used correctly in your own sentences: {v.correctUses}× · next review {formatDate(v.nextReviewAt)} · from {v.sourceType}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={STATUS[v.status]?.tone ?? "neutral"}>{STATUS[v.status]?.label ?? v.status}</Badge>
                      <div className="flex gap-2 text-sm">
                        <button className="text-accent underline" onClick={() => setReviewing([v])}>Practise</button>
                        <button className="text-ink-2 underline" onClick={() => setEditing(v.id)}>Edit</button>
                        <button className={cx("text-bad underline")} onClick={async () => { if (!confirm(`Delete “${v.term}”?`)) return; try { await api(`/api/vocab/${v.id}`, { method: "DELETE" }); setItems((xs) => xs.filter((x) => x.id !== v.id)); } catch (err) { alert(errorMessage(err)); } }}>Delete</button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className="space-y-4">
        <Card><CardTitle>Add an expression</CardTitle><EntryForm onSaved={upsert} /></Card>
        <Card>
          <CardTitle>How status works</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li><strong>Recognised</strong>: you recalled it from its meaning.</li>
            <li><strong>Used correctly</strong>: you used it naturally in your own sentence.</li>
            <li><strong>Secure</strong>: three correct uses, spaced over time. Recognition alone is not mastery.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
