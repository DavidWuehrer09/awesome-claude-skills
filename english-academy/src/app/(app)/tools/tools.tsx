"use client";

import { MessagesSquare, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, Notice, PageHeader, Tabs, Textarea } from "@/components/ui";
import { openQuickAdd } from "@/components/vocab/quick-add";
import { PHRASE_BANK } from "@/domain/writing/phrases";
import { api, errorMessage } from "@/lib/api";
import type { TextAnalysis, toolsData } from "@/server/repos/tools";

export type ToolTab = "collocations" | "phrases" | "phrasal" | "confusables" | "text";
type Data = Awaited<ReturnType<typeof toolsData>>;

const TABS: { value: ToolTab; label: string }[] = [
  { value: "collocations", label: "Collocation bank" },
  { value: "phrases", label: "Academic phrases" },
  { value: "phrasal", label: "Phrasal verbs & idioms" },
  { value: "confusables", label: "Confusables" },
  { value: "text", label: "Practice from a text" },
];

const practiseHref = (ids: string[], kinds?: string) => `/learn/session?mode=practice&ids=${ids.slice(0, 40).join(",")}${kinds ? `&kinds=${kinds}` : ""}`;
const matches = (q: string, ...values: (string | null | undefined)[]) => !q || values.some((v) => v?.toLowerCase().includes(q));

export function Tools({ data, initialTab }: { data: Data; initialTab: ToolTab }) {
  const [tab, setTab] = useState<ToolTab>(initialTab);
  const select = (t: ToolTab) => {
    setTab(t);
    window.history.replaceState(null, "", `/tools?tab=${t}`);
  };
  return (
    <>
      <PageHeader title="Tools" subtitle="Reference banks built from your own vocabulary, a phrase bank for academic writing, and practice from any text." />
      <Tabs value={tab} onChange={select} items={TABS} className="mb-5" />
      {tab === "collocations" && <CollocationBank items={data.collocations} />}
      {tab === "phrases" && <PhraseBank />}
      {tab === "phrasal" && <PhrasalBank items={data.phrasal} />}
      {tab === "confusables" && <Confusables pairs={data.confusables} />}
      {tab === "text" && <TextPractice />}
    </>
  );
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} className="mb-4 max-w-sm" />;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark className="rounded bg-accent-soft px-0.5 text-ink">{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

// ---------------------------------------------------------------- (a) collocations

function CollocationBank({ items }: { items: Data["collocations"] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = items.filter((e) => matches(needle, e.headword, ...e.collocations));
  if (!items.length) {
    return <EmptyState title="No collocations yet" action={<LinkButton href="/vocabulary">Open My Vocabulary</LinkButton>}>Add collocations to your words (or let AI suggest them on a word’s page) and they appear here.</EmptyState>;
  }
  return (
    <section aria-label="Collocation bank">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SearchBox value={q} onChange={setQ} label="Search collocations…" />
        {shown.length > 0 && <LinkButton href={practiseHref(shown.map((e) => e.id), "collocation,cloze,production")} size="sm"><Target className="size-4" aria-hidden /> Practise {Math.min(40, shown.length)} shown</LinkButton>}
      </div>
      <p className="mb-3 text-sm text-ink-3">{shown.reduce((n, e) => n + e.collocations.length, 0)} collocations from {shown.length} word{shown.length === 1 ? "" : "s"}</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {shown.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/vocabulary/${e.id}`} className="font-display text-[17px] text-ink hover:text-navy">{e.headword}</Link>
              {e.partOfSpeech && <span className="ml-2 text-xs text-ink-3">{e.partOfSpeech}</span>}
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {e.collocations.map((c) => <li key={c} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-ink-2"><Highlight text={c} q={needle} /></li>)}
              </ul>
            </div>
            <Link href={practiseHref([e.id], "collocation,cloze,production")} className="inline-flex items-center gap-1 text-sm text-navy hover:underline"><Target className="size-4" aria-hidden /> Practise</Link>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="text-sm text-ink-3">No collocation matches “{q}”.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- (b) academic phrases

function PhraseBank() {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = PHRASE_BANK.map((g) => ({ ...g, phrases: g.phrases.filter((p) => matches(needle, p, g.title)) })).filter((g) => g.phrases.length);
  return (
    <section aria-label="Academic phrase bank">
      <SearchBox value={q} onChange={setQ} label="Search phrases…" />
      <nav aria-label="Phrase groups" className="mb-4 flex flex-wrap gap-1.5">
        {groups.map((g) => <a key={g.id} href={`#phrases-${g.id}`} className="rounded-full border border-line px-3 py-0.5 text-xs text-ink-2 hover:border-navy">{g.title}</a>)}
      </nav>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id}>
            <h2 id={`phrases-${g.id}`} className="scroll-mt-24 text-lg">{g.title}</h2>
            <p className="mt-1 text-sm text-ink-3">{g.note}</p>
            <ul className="mt-3 space-y-1.5">
              {g.phrases.map((p) => <li key={p} className="font-display text-[15px] text-ink"><Highlight text={p} q={needle} /></li>)}
            </ul>
          </Card>
        ))}
      </div>
      {!groups.length && <p className="text-sm text-ink-3">No phrase matches “{q}”.</p>}
      <p className="mt-4 text-xs text-ink-3">Written for this app as a study aid. Adapt the phrases to your own argument; a precise simple sentence beats a stacked template.</p>
    </section>
  );
}

// ---------------------------------------------------------------- (c) phrasal verbs & idioms

function PhrasalBank({ items }: { items: Data["phrasal"] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "phrasal verb" | "idiom">("all");
  const needle = q.trim().toLowerCase();
  const shown = items.filter((e) => (kind === "all" || e.kind === kind) && matches(needle, e.headword, e.meaning, e.example));
  if (!items.length) {
    return <EmptyState title="No phrasal verbs or idioms yet">Words whose part of speech is “phrasal verb” or “idiom” are collected here. Set the part of speech on a word’s page.</EmptyState>;
  }
  return (
    <section aria-label="Phrasal verbs and idioms">
      <div className="flex flex-wrap items-start gap-2">
        <SearchBox value={q} onChange={setQ} label="Search phrasal verbs and idioms…" />
        <Tabs value={kind} onChange={setKind} items={[{ value: "all", label: "All" }, { value: "phrasal verb", label: "Phrasal verbs" }, { value: "idiom", label: "Idioms" }]} />
        {shown.length > 0 && <LinkButton href={practiseHref(shown.map((e) => e.id!))} size="sm" className="ml-auto"><Target className="size-4" aria-hidden /> Practise {Math.min(40, shown.length)}</LinkButton>}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {shown.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <Link href={`/vocabulary/${e.id}`} className="font-display text-[17px] text-ink hover:text-navy">{e.headword}</Link>
                <Badge tone={e.kind === "idiom" ? "accent" : "navy"}>{e.kind}</Badge>
                {e.lapses >= 2 && <Badge tone="danger">often forgotten</Badge>}
              </span>
              {e.meaning && <p className="text-sm text-ink-2">{e.meaning}</p>}
              {e.example && <p className="mt-0.5 text-sm italic text-ink-3">{e.example}</p>}
            </div>
            <Link href={practiseHref([e.id!])} className="inline-flex items-center gap-1 text-sm text-navy hover:underline"><Target className="size-4" aria-hidden /> Practise</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- (d) confusables

function Confusables({ pairs }: { pairs: Data["confusables"] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = pairs.filter((p) => matches(needle, p.a.headword, p.b.headword));
  if (!pairs.length) {
    return <EmptyState title="No confusable pairs yet" action={<LinkButton href="/tutor?ask=Compare%20words%20I%20often%20confuse">Ask the tutor</LinkButton>}>When a word lists “often confused with” entries (add them yourself or with AI suggestions on the word’s page), the pairs are compared here.</EmptyState>;
  }
  return (
    <section aria-label="Confusable words">
      <SearchBox value={q} onChange={setQ} label="Search pairs…" />
      <ul className="space-y-4">
        {shown.map((p) => {
          const ids = [p.a.id, p.b.id].filter((x): x is string => !!x);
          return (
            <li key={p.key}>
              <Card>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ConfusableSide side={p.a} />
                  <ConfusableSide side={p.b} />
                </div>
                {p.distinctions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <p className="font-medium text-ink">The difference</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">{p.distinctions.map((d) => <li key={d}>{d}</li>)}</ul>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.lapses > 0 && <Badge tone="danger">{p.lapses} lapse{p.lapses === 1 ? "" : "s"}</Badge>}
                  <LinkButton size="sm" href={practiseHref(ids, "nuance,cloze,production")}><Target className="size-4" aria-hidden /> Practise</LinkButton>
                  <LinkButton size="sm" variant="ghost" href={`/tutor?ask=${encodeURIComponent(`Compare “${p.a.headword}” and “${p.b.headword}”: meaning, register, collocations and typical contexts. Then test me with two gap sentences.`)}`}>
                    <MessagesSquare className="size-4" aria-hidden /> Ask the tutor
                  </LinkButton>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConfusableSide({ side }: { side: Data["confusables"][number]["a"] }) {
  return (
    <div className="rounded-lg border border-line p-3">
      {side.id
        ? <Link href={`/vocabulary/${side.id}`} className="font-display text-lg text-ink hover:text-navy">{side.headword}</Link>
        : <span className="font-display text-lg text-ink">{side.headword}</span>}
      {side.partOfSpeech && <span className="ml-2 text-xs text-ink-3">{side.partOfSpeech}</span>}
      {side.meaning && <p className="mt-1 text-sm text-ink-2">{side.meaning}</p>}
      {side.example && <p className="mt-1 text-sm italic text-ink-3">{side.example}</p>}
      {!side.id && (
        <button type="button" onClick={() => openQuickAdd(side.headword)} className="mt-2 inline-flex items-center gap-1 text-sm text-navy hover:underline">
          <Plus className="size-4" aria-hidden /> Not in your vocabulary: add it
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- (e) practice from a text

function TextPractice() {
  const [text, setText] = useState("");
  const [analysed, setAnalysed] = useState<{ text: string; result: TextAnalysis } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyse = async () => {
    if (!text.trim()) return setError("Paste a text first");
    setBusy(true);
    setError(null);
    try {
      const result = await api<TextAnalysis>("/api/tools/text", { method: "POST", json: { text } });
      setAnalysed({ text, result });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const highlighted = useMemo(() => {
    if (!analysed) return null;
    const names = new Map(analysed.result.found.map((f) => [f.id, f.headword]));
    const out: ReactNode[] = [];
    let at = 0;
    for (const s of analysed.result.spans) {
      if (s.start > at) out.push(analysed.text.slice(at, s.start));
      out.push(<mark key={s.start} title={names.get(s.entryId)} className="rounded bg-sage-soft px-0.5 text-ink">{analysed.text.slice(s.start, s.end)}</mark>);
      at = s.end;
    }
    out.push(analysed.text.slice(at));
    return out;
  }, [analysed]);

  return (
    <section aria-label="Practice from a text" className="space-y-4">
      <Card className="space-y-3">
        <Field label="Paste any English text" htmlFor="tool-text" hint="An article, a set text, your own essay … Your saved words are highlighted, including inflected forms.">
          <Textarea id="tool-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
        </Field>
        <div className="flex justify-end"><Button variant="primary" onClick={analyse} loading={busy}>Find my words</Button></div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>
      {analysed && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <h2 className="text-lg">Your words in the text</h2>
            <p className="mt-3 whitespace-pre-wrap font-display text-[16px] leading-relaxed text-ink">{highlighted}</p>
          </Card>
          <div className="space-y-4">
            <Card>
              <h2 className="text-lg">Found ({analysed.result.found.length})</h2>
              {!analysed.result.found.length && <p className="mt-2 text-sm text-ink-3">None of your saved words occur in this text.</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {analysed.result.found.map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <Link href={`/vocabulary/${f.id}`} className="truncate text-ink hover:text-navy">{f.headword}</Link>
                    <span className="text-ink-3">×{f.count}</span>
                  </li>
                ))}
              </ul>
              {analysed.result.found.length > 0 && (
                <LinkButton className="mt-3" size="sm" href={practiseHref(analysed.result.found.map((f) => f.id))}><Target className="size-4" aria-hidden /> Practise these</LinkButton>
              )}
            </Card>
            <Card>
              <h2 className="text-lg">Words you might add</h2>
              <p className="mt-1 text-xs text-ink-3">Longer words that are not in your vocabulary, picked by length and frequency only (not checked for usefulness). Click to add one.</p>
              {!analysed.result.candidates.length && <p className="mt-2 text-sm text-ink-3">No candidates found.</p>}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {analysed.result.candidates.map((c) => (
                  <li key={c.word}>
                    <button type="button" onClick={() => openQuickAdd(c.word)} aria-label={`Add ${c.word}`}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-sm text-ink-2 hover:border-navy hover:text-navy">
                      <Plus className="size-3" aria-hidden />{c.word}{c.count > 1 && <span className="text-ink-3">×{c.count}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
