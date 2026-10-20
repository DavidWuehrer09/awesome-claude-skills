"use client";

import clsx from "clsx";
import { AlertTriangle, Check, ClipboardPaste, FileUp, ImageUp, PencilLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flattenTopics, TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Textarea, Toggle, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ImportCandidate } from "@/db/schema";

type Job = { id: string; candidates: ImportCandidate[]; notes: string[]; detectedFormat: string | null; filename: string | null; sourceKind: string };
type Row = ImportCandidate & { topicPath: string; duplicateAction?: "skip" | "merge" | "create" };
type Source = "paste" | "file" | "image";

const STEPS = ["Source", "Content", "Review", "Done"];
const EXAMPLE = `Politics and Democracy:
to undermine — to weaken gradually
compelling — convincing and persuasive
turnout — Wahlbeteiligung

Environment:
to exacerbate — to make a problem worse (syn: aggravate)
to mitigate — abmildern
  e.g. Trees mitigate urban heat.`;

export function ImportWizard() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [defaultTopic, setDefaultTopic] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number; createdIds: string[]; topicIds: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ topics: TopicNode[] }>("/api/topics").then((t) => setTopics(t.topics)).catch(() => {});
  }, []);

  const topicPaths = useMemo(() => {
    const flat = flattenTopics(topics);
    const byId = new Map(flat.map((t) => [t.id, t]));
    return flat.map((t) => (t.parentId && byId.get(t.parentId) ? `${byId.get(t.parentId)!.name} › ${t.name}` : t.name));
  }, [topics]);

  const parse = async () => {
    setBusy("parse");
    setError(null);
    try {
      let r: { job: Job };
      if (source === "paste") {
        if (!text.trim()) throw new Error("Paste your list first");
        r = await api<{ job: Job }>("/api/imports", { method: "POST", json: { text, useAI } });
      } else {
        if (!file) throw new Error("Choose a file first");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("useAI", String(useAI || source === "image"));
        r = await api<{ job: Job }>("/api/imports", { method: "POST", body: fd });
      }
      setJob(r.job);
      setRows(r.job.candidates.map((c) => ({ ...c, topicPath: c.suggestedTopic ?? "", duplicateAction: c.duplicateOf ? (c.duplicateOf.kind === "exact" ? "skip" : "create") : undefined })));
      setStep(2);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const suggestTopics = async () => {
    if (!job) return;
    setBusy("classify");
    try {
      const r = await api<{ assignments: Record<string, string>; meta: { demo: boolean } }>(`/api/imports/${job.id}/classify`, { method: "POST" });
      setRows((rs) => rs.map((row) => (r.assignments[row.key] ? { ...row, topicPath: r.assignments[row.key] } : row)));
      toast({ tone: "sage", text: r.meta.demo ? "Topics proposed by keyword rules (demo mode). Check them." : "Topics proposed. Check and adjust them." });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!job) return;
    setBusy("commit");
    setError(null);
    try {
      const r = await api<typeof result & object>(`/api/imports/${job.id}/commit`, {
        method: "POST",
        json: {
          candidates: rows.map((r) => ({
            key: r.key, headword: r.headword, translationDe: r.translationDe || undefined, definitionEn: r.definitionEn || undefined, example: r.example || undefined,
            partOfSpeech: r.partOfSpeech || undefined, synonyms: r.synonyms, antonyms: r.antonyms, include: r.include, duplicateAction: r.duplicateAction,
            topicPath: r.topicPath.trim() || undefined,
          })),
          defaultTopicId: defaultTopic || null,
          defaultTopicName: !defaultTopic && newTopicName.trim() ? newTopicName.trim() : null,
        },
      });
      setResult(r);
      setStep(3);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const included = rows.filter((r) => r.include && r.headword).length;
  const flagged = rows.filter((r) => r.uncertain.length).length;

  return (
    <>
      <PageHeader title="Import vocabulary" subtitle="Paste a list, upload a file or a photo. You review every entry before anything is saved." />
      <ol className="mb-6 flex gap-2 text-sm" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} className={clsx("flex items-center gap-2 rounded-full px-3 py-1", i === step ? "bg-navy text-navy-ink" : i < step ? "bg-sage-soft text-sage" : "bg-surface-2 text-ink-3")} aria-current={i === step ? "step" : undefined}>
            {i < step ? <Check className="size-3.5" aria-hidden /> : <span>{i + 1}</span>} {s}
          </li>
        ))}
      </ol>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["paste", ClipboardPaste, "Paste a list", "Copied from a worksheet, document or website. Most formats are detected automatically."],
            ["file", FileUp, "Upload a file", "TXT, CSV, DOCX, PDF or XLSX, up to 10 MB."],
            ["image", ImageUp, "Photo or screenshot", "Textbook pages, worksheets, handwritten lists. Needs the AI provider for reading."],
          ] as const).map(([value, Icon, title, desc]) => (
            <button key={value} type="button" onClick={() => { setSource(value); setStep(1); }}
              className="rounded-xl border border-line bg-surface p-5 text-left shadow-[var(--shadow)] transition-colors hover:border-navy">
              <Icon className="size-6 text-navy" aria-hidden />
              <h2 className="mt-3 text-lg">{title}</h2>
              <p className="mt-1 text-sm text-ink-2">{desc}</p>
            </button>
          ))}
          <Link href="/vocabulary?add=1" className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow)] hover:border-navy">
            <PencilLine className="size-6 text-navy" aria-hidden />
            <h2 className="mt-3 text-lg">Single word</h2>
            <p className="mt-1 text-sm text-ink-2">Add one word, phrase, idiom or collocation.</p>
          </Link>
        </div>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          {source === "paste" ? (
            <Field label="Your list" htmlFor="paste" hint="One entry per line. Separators like —, –, -, :, =, tabs, CSV and headings are recognised. Indented lines or e.g. add examples.">
              <Textarea id="paste" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} className="font-mono text-sm" />
            </Field>
          ) : (
            <div>
              <input ref={fileInput} type="file" className="sr-only" id="file"
                accept={source === "image" ? "image/png,image/jpeg,image/webp,image/gif,application/pdf" : ".txt,.csv,.tsv,.docx,.pdf,.xlsx,text/plain"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="file" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-6 py-10 text-center hover:border-navy">
                {source === "image" ? <ImageUp className="size-8 text-ink-3" aria-hidden /> : <FileUp className="size-8 text-ink-3" aria-hidden />}
                <span className="font-medium">{file ? file.name : "Choose a file"}</span>
                <span className="text-sm text-ink-3">{file ? `${(file.size / 1024).toFixed(0)} KB` : source === "image" ? "Photo, screenshot or scanned PDF" : "TXT · CSV · DOCX · PDF · XLSX"}</span>
              </label>
              {source === "image" && <p className="mt-3 text-sm text-ink-2">Images are read by the configured vision-capable AI model. Unreadable parts are flagged, never guessed. Please compare with the original before importing.</p>}
            </div>
          )}
          {source !== "image" && (
            <Toggle checked={useAI} onChange={setUseAI} label="Use AI to interpret messy formatting"
              description="Optional. The built-in parser handles most lists offline; AI helps with unusual layouts." />
          )}
          <div className="flex justify-between gap-2">
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="primary" onClick={parse} loading={busy === "parse"}>Detect entries</Button>
          </div>
        </Card>
      )}

      {step === 2 && job && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm"><strong>{rows.length}</strong> entries detected · <strong>{included}</strong> selected{flagged ? <> · <span className="text-warn">{flagged} to check</span></> : null}</p>
              {job.notes.map((n, i) => <Badge key={i}>{n}</Badge>)}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <Field label="Topic for entries without one" htmlFor="deftopic">
                <TopicSelect id="deftopic" topics={topics} value={defaultTopic} onChange={setDefaultTopic} placeholder="— create new or leave unsorted —" />
              </Field>
              {!defaultTopic && (
                <Field label="…or a new topic" htmlFor="newtopic"><Input id="newtopic" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="e.g. Unit 3: The American Dream" /></Field>
              )}
              <Button onClick={suggestTopics} loading={busy === "classify"}><Sparkles className="size-4" aria-hidden /> Suggest topics</Button>
            </div>
          </Card>

          <datalist id="topic-paths">{[...new Set([...topicPaths, ...rows.map((r) => r.topicPath).filter(Boolean)])].map((p) => <option key={p} value={p} />)}</datalist>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className={clsx("rounded-xl border bg-surface p-3", r.uncertain.length ? "border-warn/50" : "border-line", !r.include && "opacity-60")}>
                <div className="grid gap-2 md:grid-cols-[auto_1.1fr_1fr_1.3fr_1fr] md:items-start">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Include ${r.headword || "entry"}`} className="mt-3 size-4 accent-[var(--navy)]" />
                  <Input aria-label="Word" value={r.headword} onChange={(e) => update(r.key, { headword: e.target.value })} className="font-display" />
                  <Input aria-label="German translation" placeholder="Deutsch" value={r.translationDe ?? ""} onChange={(e) => update(r.key, { translationDe: e.target.value })} />
                  <Input aria-label="English definition" placeholder="English definition" value={r.definitionEn ?? ""} onChange={(e) => update(r.key, { definitionEn: e.target.value })} />
                  <Input aria-label="Topic" list="topic-paths" placeholder="Topic › Subtopic" value={r.topicPath} onChange={(e) => update(r.key, { topicPath: e.target.value })} />
                </div>
                {(r.example || r.uncertain.length > 0 || r.duplicateOf) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-sm">
                    {r.example && <span className="text-ink-2">e.g. <em className="font-display">{r.example}</em></span>}
                    {r.uncertain.map((u, i) => <Badge key={i} tone="warn"><AlertTriangle className="size-3" aria-hidden /> {u}</Badge>)}
                    {r.duplicateOf && (
                      <span className="flex items-center gap-2">
                        <Badge tone="accent">{r.duplicateOf.kind === "exact" ? "Already in your vocabulary" : "Similar to"}: {r.duplicateOf.headword}</Badge>
                        <select aria-label="Duplicate handling" value={r.duplicateAction} onChange={(e) => update(r.key, { duplicateAction: e.target.value as Row["duplicateAction"] })} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                          <option value="skip">Skip (keep existing, add to topic)</option>
                          <option value="merge">Merge new details into existing</option>
                          <option value="create">Create as separate word</option>
                        </select>
                      </span>
                    )}
                    {r.raw && r.uncertain.length > 0 && <span className="w-full text-xs text-ink-3">Original line: <code>{r.raw}</code></span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="sticky bottom-20 z-10 flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
            <Button onClick={async () => { await api(`/api/imports/${job.id}/cancel`, { method: "POST" }).catch(() => {}); setStep(1); }}>Start over</Button>
            <Button variant="primary" onClick={commit} loading={busy === "commit"} disabled={!included}>Import {included} entr{included === 1 ? "y" : "ies"}</Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <Card className="max-w-xl">
          <h2 className="text-xl">Import complete</h2>
          <ul className="mt-3 space-y-1 text-ink-2">
            <li>{result.created} new word{result.created === 1 ? "" : "s"} created</li>
            {result.merged > 0 && <li>{result.merged} merged into existing words</li>}
            {result.skipped > 0 && <li>{result.skipped} skipped</li>}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            {result.createdIds.length > 0 && (
              <Button variant="primary" onClick={() => router.push(`/learn/session?mode=practice&ids=${result.createdIds.slice(0, 40).join(",")}`)}>Start learning them now</Button>
            )}
            <Button onClick={() => router.push(result.topicIds[0] ? `/vocabulary?topic=${result.topicIds[0]}` : "/vocabulary?list=recent")}>View words</Button>
            <Button variant="ghost" onClick={() => { setStep(0); setText(""); setFile(null); setResult(null); setJob(null); }}>Import more</Button>
          </div>
        </Card>
      )}
    </>
  );
}
