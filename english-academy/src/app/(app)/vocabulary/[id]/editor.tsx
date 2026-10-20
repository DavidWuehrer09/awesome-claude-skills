"use client";

import { ArrowLeft, Flag, MessagesSquare, Play, Sparkles, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { flattenTopics, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, Card, Field, Input, Meter, Notice, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { DIMENSIONS, LEVEL_LABEL, masteryLevel } from "@/domain/learning/mastery";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { MasteryMap } from "@/db/schema";

type Entry = {
  id: string; headword: string; partOfSpeech: string | null; translationDe: string | null; definitionEn: string | null; cefr: string | null;
  register: string | null; connotation: string | null; collocations: string[]; synonyms: string[]; antonyms: string[];
  wordFamily: { form: string; pos?: string }[]; patterns: string[]; grammarNotes: string | null; pronunciation: string | null; ipa: string | null;
  commonMistakes: string[]; confusables: { word: string; distinction: string }[]; idioms: string[]; acceptedAnswers: string[];
  source: string | null; mnemonic: string | null; notes: string | null; favorite: boolean; isSample: boolean; version: number;
  enrichment: { provider: string; demo: boolean; at: string } | null;
};
type Data = {
  entry: Entry;
  examples: { id: string; text: string; kind: string }[];
  topics: { id: string; name: string }[];
  tags: string[];
  state: { due: string; reps: number; lapses: number; stability: number; state: number; introducedAt: string | null; mastery: MasteryMap; markedDifficult: boolean; lastReview: string | null } | null;
  events: { reviewedAt: string; exerciseKind: string; outcome: string; rating: number; hintsUsed: number; independent: boolean; undoneAt: string | null }[];
};
type Suggestions = Record<string, unknown> & { uncertainty?: string | null };

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const LIST_FIELDS = ["collocations", "synonyms", "antonyms", "patterns", "commonMistakes", "idioms", "acceptedAnswers"] as const;
const TEXT_FIELDS = ["partOfSpeech", "translationDe", "definitionEn", "register", "connotation", "grammarNotes", "pronunciation", "ipa", "source", "mnemonic", "notes"] as const;
const LABEL: Record<string, string> = {
  partOfSpeech: "Part of speech", translationDe: "German translation", definitionEn: "English definition", register: "Register", connotation: "Connotation & nuance",
  grammarNotes: "Grammar notes (countability, patterns)", pronunciation: "Pronunciation hint", ipa: "IPA", source: "Source / original context", mnemonic: "Personal mnemonic",
  notes: "Personal notes", collocations: "Collocations", synonyms: "Synonyms", antonyms: "Antonyms", patterns: "Grammatical patterns", commonMistakes: "Common mistakes",
  idioms: "Related expressions & idioms", acceptedAnswers: "Also accept as correct answer", cefr: "CEFR", wordFamily: "Word family", confusables: "Easily confused words", examples: "Examples",
};

export function EntryEditor({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [examples, setExamples] = useState<{ text: string; kind: string }[]>([]);
  const [suggestions, setSuggestions] = useState<{ data: Suggestions; demo: boolean } | null>(null);
  const [busy, setBusy] = useState<"save" | "enrich" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = useCallback(() => Promise.all([api<Data>(`/api/vocab/${id}`), api<{ topics: TopicNode[] }>("/api/topics")])
    .then(([d, t]) => {
      setData(d);
      setTopics(t.topics);
      const e = d.entry;
      const f: Record<string, string> = { headword: e.headword, cefr: e.cefr ?? "" };
      for (const k of TEXT_FIELDS) f[k] = (e[k] as string | null) ?? "";
      for (const k of LIST_FIELDS) f[k] = (e[k] as string[]).join("\n");
      f.wordFamily = e.wordFamily.map((w) => (w.pos ? `${w.form} (${w.pos})` : w.form)).join("\n");
      f.confusables = e.confusables.map((c) => `${c.word}: ${c.distinction}`).join("\n");
      f.tags = d.tags.join(", ");
      setForm(f);
      setTopicIds(d.topics.map((t) => t.id));
      setExamples(d.examples.map((x) => ({ text: x.text, kind: x.kind })));
      setConflict(false);
    })
    .catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => void load(), [load]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!data) return;
    setBusy("save");
    setError(null);
    try {
      const patch: Record<string, unknown> = { headword: form.headword, cefr: form.cefr || null };
      for (const k of TEXT_FIELDS) patch[k] = form[k]?.trim() || null;
      for (const k of LIST_FIELDS) patch[k] = lines(form[k] ?? "");
      patch.wordFamily = lines(form.wordFamily ?? "").map((l) => {
        const m = /^(.+?)\s*\(([^)]+)\)$/.exec(l);
        return m ? { form: m[1], pos: m[2] } : { form: l };
      });
      patch.confusables = lines(form.confusables ?? "").map((l) => {
        const [word, ...rest] = l.split(":");
        return { word: word.trim(), distinction: rest.join(":").trim() };
      }).filter((c) => c.word);
      patch.tags = (form.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      patch.topicIds = topicIds;
      patch.examples = examples.filter((x) => x.text.trim()).map((x) => ({ text: x.text.trim(), kind: x.kind }));
      await api(`/api/vocab/${id}`, { method: "PATCH", json: { baseVersion: data.entry.version, patch } });
      toast({ tone: "sage", text: "Saved" });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === "conflict" && /changed elsewhere/.test(e.message)) setConflict(true);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const enrich = async () => {
    setBusy("enrich");
    try {
      const r = await api<{ suggestions: Suggestions; meta: { demo: boolean } }>(`/api/vocab/${id}/enrich`, { method: "POST" });
      setSuggestions({ data: r.suggestions, demo: r.meta.demo });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const applySuggestion = (k: string) => {
    if (!suggestions) return;
    const v = suggestions.data[k];
    if (k === "examples") {
      setExamples((ex) => [...ex, ...(v as { text: string; kind: string }[])]);
    } else if (k === "wordFamily") {
      set(k, [form[k], ...(v as { form: string; pos: string }[]).map((w) => `${w.form} (${w.pos})`)].filter(Boolean).join("\n"));
    } else if (k === "confusables") {
      set(k, [form[k], ...(v as { word: string; distinction: string }[]).map((c) => `${c.word}: ${c.distinction}`)].filter(Boolean).join("\n"));
    } else if (Array.isArray(v)) {
      set(k, [...new Set([...lines(form[k] ?? ""), ...(v as string[])])].join("\n"));
    } else if (typeof v === "string") {
      set(k, v);
    }
    setSuggestions((s) => s && { ...s, data: { ...s.data, [k]: Array.isArray(v) ? [] : null } });
  };

  const remove = async () => {
    if (!confirm(`Delete “${data?.entry.headword}” and its learning history?`)) return;
    await api(`/api/vocab/${id}`, { method: "DELETE" });
    toast({ tone: "neutral", text: "Word deleted" });
    router.push("/vocabulary");
  };

  const toggleDifficult = async () => {
    if (!data?.state) return;
    await api(`/api/vocab/${id}/difficult`, { method: "POST", json: { difficult: !data.state.markedDifficult } });
    void load();
  };
  const toggleFavorite = async () => {
    if (!data) return;
    await api("/api/vocab/bulk", { method: "POST", json: { action: "favorite", ids: [id], value: !data.entry.favorite } });
    void load();
  };

  if (error && !data) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Spinner />;
  const st = data.state;
  const level = st ? masteryLevel(st.mastery, st.stability) : "new";
  const suggestionKeys = suggestions
    ? Object.entries(suggestions.data).filter(([k, v]) => k !== "uncertainty" && (Array.isArray(v) ? v.length : v)).map(([k]) => k)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/vocabulary" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Vocabulary</Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => router.push(`/learn/session?mode=practice&ids=${id}`)}><Play className="size-4" aria-hidden /> Practise</Button>
          <Button size="sm" onClick={() => router.push(`/tutor?attach=${id}`)}><MessagesSquare className="size-4" aria-hidden /> Ask tutor</Button>
          <Button size="sm" onClick={toggleFavorite} aria-pressed={data.entry.favorite}><Star className={`size-4 ${data.entry.favorite ? "fill-accent text-accent" : ""}`} aria-hidden /> Favourite</Button>
          {st && <Button size="sm" onClick={toggleDifficult} aria-pressed={st.markedDifficult}><Flag className="size-4" aria-hidden /> {st.markedDifficult ? "Marked difficult" : "Mark difficult"}</Button>}
          <Button size="sm" variant="danger" onClick={remove}><Trash2 className="size-4" aria-hidden /> Delete</Button>
        </div>
      </div>

      {params.get("new") === "1" && <Notice tone="sage">Added. Fill in what you know, or let AI suggest definitions, collocations and examples for you to check.</Notice>}
      {data.entry.isSample && <Notice>This word belongs to the sample collection. Edit it freely, or remove all sample data in Settings.</Notice>}
      {conflict && <Notice tone="warn" title="Changed on another device">Your edits were not saved to avoid overwriting newer data. <button className="underline" onClick={load}>Load the newer version</button> (your unsaved changes will be lost).</Notice>}
      {error && !conflict && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_160px_110px]">
              <Field label="Headword or expression" htmlFor="hw"><Input id="hw" value={form.headword ?? ""} onChange={(e) => set("headword", e.target.value)} className="font-display text-lg" /></Field>
              <Field label="Part of speech" htmlFor="pos"><Input id="pos" value={form.partOfSpeech ?? ""} onChange={(e) => set("partOfSpeech", e.target.value)} placeholder="verb, noun…" /></Field>
              <Field label="CEFR" htmlFor="cefr">
                <Select id="cefr" value={form.cefr ?? ""} onChange={(e) => set("cefr", e.target.value)}>
                  <option value="">–</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(["translationDe", "definitionEn"] as const).map((k) => (
                <Field key={k} label={LABEL[k]} htmlFor={k}><Textarea id={k} rows={2} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={enrich} loading={busy === "enrich"}><Sparkles className="size-4" aria-hidden /> Suggest details with AI</Button>
              <span className="text-xs text-ink-3">Suggestions are shown for review; nothing changes until you apply and save.</span>
            </div>
          </Card>

          {suggestions && (
            <Card className="border-accent/40">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg">AI suggestions</h2>
                {suggestions.demo && <Badge tone="warn">demo – not real AI</Badge>}
              </div>
              {typeof suggestions.data.uncertainty === "string" && suggestions.data.uncertainty && <p className="mt-2 text-sm text-warn">{suggestions.data.uncertainty}</p>}
              {!suggestionKeys.length && <p className="mt-2 text-sm text-ink-3">No further suggestions.</p>}
              <ul className="mt-3 space-y-3">
                {suggestionKeys.map((k) => {
                  const v = suggestions.data[k];
                  const shown = Array.isArray(v)
                    ? (v as unknown[]).map((x) => (typeof x === "string" ? x : (x as { text?: string; form?: string; word?: string; distinction?: string; pos?: string }).text ?? `${(x as { form?: string; word?: string }).form ?? (x as { word?: string }).word}${(x as { distinction?: string }).distinction ? `: ${(x as { distinction?: string }).distinction}` : ""}${(x as { pos?: string }).pos ? ` (${(x as { pos?: string }).pos})` : ""}`)).join(" · ")
                    : String(v);
                  return (
                    <li key={k} className="flex items-start justify-between gap-3 rounded-lg bg-surface-2 p-3">
                      <div className="min-w-0 text-sm"><p className="font-medium text-ink-2">{LABEL[k] ?? k}</p><p className="text-ink">{shown}</p></div>
                      <Button size="sm" onClick={() => applySuggestion(k)}>Apply</Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="text-lg">Usage</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(["collocations", "synonyms", "antonyms", "patterns"] as const).map((k) => (
                <Field key={k} label={LABEL[k]} htmlFor={k} hint="One per line"><Textarea id={k} rows={3} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
              ))}
              <Field label={LABEL.wordFamily} htmlFor="wf" hint="One per line, e.g. mitigation (noun)"><Textarea id="wf" rows={3} value={form.wordFamily ?? ""} onChange={(e) => set("wordFamily", e.target.value)} /></Field>
              <Field label={LABEL.confusables} htmlFor="cf" hint="word: how it differs"><Textarea id="cf" rows={3} value={form.confusables ?? ""} onChange={(e) => set("confusables", e.target.value)} /></Field>
              {(["register", "connotation", "grammarNotes", "ipa", "pronunciation"] as const).map((k) => (
                <Field key={k} label={LABEL[k]} htmlFor={k}><Input id={k} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
              ))}
              {(["commonMistakes", "idioms", "acceptedAnswers"] as const).map((k) => (
                <Field key={k} label={LABEL[k]} htmlFor={k} hint="One per line"><Textarea id={k} rows={2} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg">Examples</h2>
            <ul className="mt-3 space-y-2">
              {examples.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <Select aria-label="Example type" value={x.kind} onChange={(e) => setExamples((ex) => ex.map((y, j) => (j === i ? { ...y, kind: e.target.value } : y)))} className="w-32 shrink-0">
                    <option value="natural">natural</option><option value="academic">academic</option><option value="source">from source</option><option value="user">my own</option><option value="context">context</option>
                  </Select>
                  <Input aria-label={`Example ${i + 1}`} value={x.text} onChange={(e) => setExamples((ex) => ex.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} className="font-display" />
                  <Button size="sm" variant="ghost" aria-label="Remove example" onClick={() => setExamples((ex) => ex.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
            <Button size="sm" className="mt-3" onClick={() => setExamples((ex) => [...ex, { text: "", kind: "user" }])}>Add example</Button>
          </Card>

          <Card>
            <h2 className="text-lg">Organisation and notes</h2>
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm font-medium text-ink-2">Topics (a word can belong to several)</legend>
              <div className="flex flex-wrap gap-2">
                {flattenTopics(topics).map((t) => (
                  <label key={t.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${topicIds.includes(t.id) ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-2"}`}>
                    <input type="checkbox" className="sr-only" checked={topicIds.includes(t.id)} onChange={() => setTopicIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))} />
                    {t.depth ? "↳ " : ""}{t.name}
                  </label>
                ))}
                {!topics.length && <span className="text-sm text-ink-3">No topics yet. <Link className="underline" href="/vocabulary/topics">Create one</Link></span>}
              </div>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Tags" htmlFor="tags" hint="Comma separated"><Input id="tags" value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} /></Field>
              <Field label={LABEL.source} htmlFor="source"><Input id="source" value={form.source ?? ""} onChange={(e) => set("source", e.target.value)} /></Field>
              <Field label={LABEL.mnemonic} htmlFor="mnemonic"><Textarea id="mnemonic" rows={2} value={form.mnemonic ?? ""} onChange={(e) => set("mnemonic", e.target.value)} /></Field>
              <Field label={LABEL.notes} htmlFor="notes"><Textarea id="notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
          </Card>

          <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
            <Button variant="primary" size="lg" onClick={save} loading={busy === "save"} className="shadow-lg">Save changes</Button>
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg">Mastery</h2>
            <p className="mt-1 text-sm text-ink-2">Level: <strong>{LEVEL_LABEL[level]}</strong></p>
            <ul className="mt-4 space-y-3">
              {DIMENSIONS.map((d) => {
                const v = st?.mastery[d.key];
                return (
                  <li key={d.key}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-ink-2">{d.label}</span><span className="text-ink-3">{v ? `${Math.round(v.score * 100)}% · ${v.n}×` : "no data"}</span></div>
                    <Meter value={(v?.score ?? 0) * 100} label={d.label} tone={d.key === "writing" || d.key === "production" ? "accent" : "navy"} />
                  </li>
                );
              })}
            </ul>
            {st?.introducedAt && (
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-ink-3">Next review</dt><dd>{new Date(st.due).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd>
                <dt className="text-ink-3">Reviews</dt><dd>{st.reps}</dd>
                <dt className="text-ink-3">Forgotten</dt><dd>{st.lapses}×</dd>
                <dt className="text-ink-3">Stability</dt><dd>{st.stability.toFixed(1)} days</dd>
              </dl>
            )}
          </Card>
          <Card>
            <h2 className="text-lg">History</h2>
            {data.events.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.events.map((ev, i) => (
                  <li key={i} className={`flex justify-between gap-2 ${ev.undoneAt ? "line-through opacity-50" : ""}`}>
                    <span className="truncate text-ink-2">{ev.exerciseKind.replace(/_/g, " ")}{ev.hintsUsed ? " · hint" : ""}</span>
                    <span className={ev.outcome === "wrong" || ev.outcome === "revealed" ? "text-danger" : "text-sage"}>{ev.outcome}</span>
                    <span className="shrink-0 text-ink-3">{new Date(ev.reviewedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-3">Not practised yet.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
