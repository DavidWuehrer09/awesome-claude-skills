"use client";

import { ExternalLink, FileUp, GraduationCap, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type Course, DIFFICULTY_LABEL, DocTypeBadge, formatBytes, type MaterialRow, PointsRange, type ProfileEntry, ProvenanceBadge, STATUS_LABEL,
} from "@/components/examiner/shared";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, Notice, PageHeader, Select, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { CONFIDENCE, DOC_TYPE_LABEL, DOC_TYPES, type DocType, PROFILE_SECTIONS, PROVENANCE, PROVENANCE_LABEL } from "@/domain/examiner/model";
import { STATUS_LABEL as WEAKNESS_STATUS, type WeaknessStatus } from "@/domain/examiner/weaknesses";
import { api, ApiError, errorMessage } from "@/lib/api";

export type Tab = "overview" | "materials" | "profile" | "exams" | "weaknesses";

type ExamRow = { id: string; title: string; difficulty: keyof typeof DIFFICULTY_LABEL; isDemo: boolean; createdAt: string; topic: string; durationMinutes: number; tasks: number; attempts: { id: string; status: string; createdAt: string }[] };
type Weak = {
  skills: { skill: string; label: string; status: WeaknessStatus; priority: number; timesPresent: number; history: unknown[] }[];
  results: { id: string; title: string; date: string; version: number; low: number; high: number; best: number | null; basis: string }[];
  recommendation: { difficulty: keyof typeof DIFFICULTY_LABEL; focus: { skill: string; label: string; status: WeaknessStatus }[]; drills: Record<string, number>; advice: string[]; secure: string[] };
  demoAssessments: number;
};

const sectionLabel = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function ExaminerHome({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/abitur/examiner?tab=${t}`, { scroll: false });
  };
  return (
    <>
      <PageHeader eyebrow="Abitur Academy" title="My English Examiner"
        subtitle="Upload your Klausuren, rubrics and corrections, build an evidence-based profile of your course, and practise with original exams graded like a demanding teacher would."
        actions={<LinkButton href="/abitur/examiner/new" variant="primary"><Plus className="size-4" aria-hidden /> New exam</LinkButton>} />
      <Tabs value={tab} onChange={change} className="mb-6" items={[
        { value: "overview", label: "Overview" }, { value: "materials", label: "My Materials" }, { value: "profile", label: "Course Profile" },
        { value: "exams", label: "Exams" }, { value: "weaknesses", label: "My Weaknesses" },
      ]} />
      {tab === "overview" && <Overview go={change} />}
      {tab === "materials" && <Materials />}
      {tab === "profile" && <Profile />}
      {tab === "exams" && <Exams />}
      {tab === "weaknesses" && <Weaknesses />}
    </>
  );
}

// ---------------------------------------------------------------- overview

function Overview({ go }: { go: (t: Tab) => void }) {
  const [data, setData] = useState<{ materials: MaterialRow[]; weak: Weak; exams: ExamRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<{ materials: MaterialRow[] }>("/api/examiner/materials"), api<Weak>("/api/examiner/weaknesses"), api<{ exams: ExamRow[] }>("/api/examiner/exams")])
      .then(([m, w, e]) => setData({ materials: m.materials, weak: w, exams: e.exams }))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Spinner />;
  const pending = data.materials.filter((m) => !m.usable);
  const rec = data.weak.recommendation;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Card>
          <h2 className="text-lg">How this works</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li><button className="underline" onClick={() => go("materials")}>Upload</button> previous exams, rubrics, corrections and source texts. Confirm what each document is and check the extracted text.</li>
            <li>Build your <button className="underline" onClick={() => go("profile")}>course profile</button>. Every statement shows where it comes from: your teacher&apos;s words, a pattern in your documents, or a general principle.</li>
            <li>Generate an <Link className="underline" href="/abitur/examiner/new">original practice exam</Link> in the format of your course and write it under exam conditions.</li>
            <li>Get teacher-style feedback, an indicative 0–15 estimate, an improvement lab and a model answer. Revise and compare versions.</li>
          </ol>
        </Card>
        {pending.length > 0 && (
          <Card>
            <h2 className="text-lg">Documents waiting for you</h2>
            <p className="mt-1 text-sm text-ink-2">A document is only used as evidence after you confirm its type and check its text.</p>
            <ul className="mt-3 divide-y divide-line">
              {pending.slice(0, 6).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/abitur/examiner/materials/${m.id}`} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{m.filename}</Link>
                  <DocTypeBadge m={m} />
                  <Badge tone={m.extractionStatus === "reviewed" ? "sage" : "warn"}>{STATUS_LABEL[m.extractionStatus]}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <h2 className="text-lg">Recent exams</h2>
          {data.exams.length ? (
            <ul className="mt-2 divide-y divide-line">
              {data.exams.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <Link href={`/abitur/examiner/exams/${e.id}`} className="min-w-0 flex-1 truncate hover:underline">{e.title}</Link>
                  {e.isDemo && <Badge tone="warn">demo</Badge>}
                  <Badge>{DIFFICULTY_LABEL[e.difficulty]}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-2">No exams yet. <Link className="underline" href="/abitur/examiner/new">Create your first one</Link>.</p>}
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <h2 className="text-lg">Next step</h2>
          <p className="mt-1 text-sm">Recommended difficulty: <strong>{DIFFICULTY_LABEL[rec.difficulty]}</strong></p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{rec.advice.map((a) => <li key={a}>{a}</li>)}</ul>
          {rec.focus.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{rec.focus.map((f) => <Badge key={f.skill} tone={f.status === "recurring" ? "danger" : "accent"}>{f.label}</Badge>)}</div>
          )}
          <Button className="mt-4" size="sm" onClick={() => go("weaknesses")}>See all weaknesses</Button>
        </Card>
        <Card>
          <h2 className="text-lg">In numbers</h2>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-3">Documents</dt><dd className="text-2xl tabular-nums">{data.materials.length}</dd></div>
            <div><dt className="text-ink-3">Usable as evidence</dt><dd className="text-2xl tabular-nums">{data.materials.length - pending.length}</dd></div>
            <div><dt className="text-ink-3">Exams</dt><dd className="text-2xl tabular-nums">{data.exams.length}</dd></div>
            <div><dt className="text-ink-3">Assessed results</dt><dd className="text-2xl tabular-nums">{data.weak.results.length}</dd></div>
          </dl>
        </Card>
        <Notice title="Academic honesty">
          Exams here are original practice material, never official papers. Point estimates are indicative AI estimates on the 0–15 scale, not grades and not predictions of your teacher&apos;s marking. Do not hand in AI-written answers as your own.
        </Notice>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- materials

function Materials() {
  const toast = useToast();
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<DocType | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [upType, setUpType] = useState<DocType | "">("");
  const [topics, setTopics] = useState("");
  const [importance, setImportance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (type) p.set("docType", type);
    return api<{ materials: MaterialRow[] }>(`/api/examiner/materials?${p}`).then((r) => setRows(r.materials)).catch((e) => setError(errorMessage(e)));
  }, [q, type]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (upType) form.set("docType", upType);
    form.set("labels", JSON.stringify({ topic: topics.split(",").map((t) => t.trim()).filter(Boolean), ...(importance ? { importance } : {}) }));
    try {
      const r = await api<{ materials: MaterialRow[] }>("/api/examiner/materials", { method: "POST", body: form });
      toast({ tone: "sage", text: `${r.materials.length} document${r.materials.length === 1 ? "" : "s"} uploaded. Check each one before it is used.` });
      setFiles([]);
      setTopics("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="order-2 lg:order-1">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input aria-label="Search your documents" className="pl-9" placeholder="Search text, file names and labels…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as DocType | "")} className="w-auto">
            <option value="">All types</option>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
          </Select>
        </div>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<FileUp className="size-6" />} title={q || type ? "Nothing found" : "No documents yet"}>
            {q || type ? "Try other search terms." : "Upload previous Klausuren, your teacher's rubric or corrected work to start."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/abitur/examiner/materials/${m.id}`} className="min-w-0 basis-full truncate font-medium hover:underline sm:basis-0 sm:flex-1">{m.labels.title || m.filename}</Link>
                  <DocTypeBadge m={m} />
                  <Badge tone={m.extractionStatus === "reviewed" ? "sage" : "warn"}>{STATUS_LABEL[m.extractionStatus]}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                  <span>{m.filename}</span><span>{formatBytes(m.bytes)}</span>
                  {m.labels.topic.map((t) => <span key={t}>#{t}</span>)}
                  {m.labels.importance && <span>importance: {m.labels.importance}</span>}
                  {m.duplicateOf && <span className="text-warn">same file uploaded before</span>}
                </div>
                {m.snippets.map((s, i) => <p key={i} className="mt-1 line-clamp-2 text-sm text-ink-2">…{s}…</p>)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Card className="order-1 h-fit lg:order-2">
        <h2 className="text-lg">Upload documents</h2>
        <p className="mt-1 text-sm text-ink-2">PDF, Word, text or photos (max. 10 MB each, up to 10 at once). Photos and scanned PDFs are transcribed by the AI on request and must be checked.</p>
        <div className="mt-3 space-y-3">
          <Field label="Files" htmlFor="up-files">
            <input id="up-files" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5"
              onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          </Field>
          <Field label="Type (optional)" htmlFor="up-type" hint="If you leave this empty, the app suggests a type and asks you to confirm it.">
            <Select id="up-type" value={upType} onChange={(e) => setUpType(e.target.value as DocType | "")}>
              <option value="">Let the app suggest</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Topics (comma-separated)" htmlFor="up-topics"><Input id="up-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. Globalisation, Shakespeare" /></Field>
          <Field label="Importance" htmlFor="up-imp">
            <Select id="up-imp" value={importance} onChange={(e) => setImportance(e.target.value)}>
              <option value="">Normal</option><option value="essential">Essential</option><option value="high">High</option><option value="low">Low</option>
            </Select>
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button variant="primary" className="w-full" onClick={upload} loading={busy} disabled={!files.length}><FileUp className="size-4" aria-hidden /> Upload {files.length > 1 ? `${files.length} files` : ""}</Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- course profile

type Suggestion = { section: string; statement: string; provenance: (typeof PROVENANCE)[number]; confidence: (typeof CONFIDENCE)[number]; evidence: { materialId: string | null; quote: string | null; location: string | null; url: string | null }[] };

function Profile() {
  const toast = useToast();
  const [data, setData] = useState<{ entries: ProfileEntry[]; course: Course; notes: string[] } | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [suggest, setSuggest] = useState<{ entries: Suggestion[]; gaps: string[]; demo: boolean; chosen: Set<number> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const load = useCallback(() => Promise.all([api<{ entries: ProfileEntry[]; course: Course; notes: string[] }>("/api/examiner/profile"), api<{ materials: MaterialRow[] }>("/api/examiner/materials")])
    .then(([p, m]) => {
      setData(p);
      setMaterials(m.materials);
    }), []);
  useEffect(() => void load(), [load]);
  const name = (id?: string) => materials.find((m) => m.id === id)?.filename ?? "deleted document";

  const handle = (e: unknown) => {
    if (e instanceof ApiError && Array.isArray(e.details)) setProblems(e.details as string[]);
    toast({ tone: "danger", text: errorMessage(e) });
  };
  const runSuggest = async () => {
    setBusy("suggest");
    try {
      const r = await api<{ entries: Suggestion[]; gaps: string[]; demo: boolean }>("/api/examiner/profile/suggest", { method: "POST" });
      setSuggest({ ...r, chosen: new Set(r.entries.map((_, i) => i)) });
    } catch (e) { handle(e); } finally { setBusy(null); }
  };
  const addEntries = async (entries: unknown[]) => {
    setBusy("add");
    setProblems([]);
    try {
      await api("/api/examiner/profile", { method: "POST", json: { entries } });
      toast({ tone: "sage", text: "Added to your course profile" });
      setSuggest(null);
      await load();
      return true;
    } catch (e) { handle(e); return false; } finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this profile entry?")) return;
    await api(`/api/examiner/profile/${id}`, { method: "DELETE" }).catch(handle);
    await load();
  };
  const saveCourse = async (patch: Record<string, unknown>) => {
    try {
      await api("/api/examiner/profile", { method: "PATCH", json: patch });
      await load();
      toast({ tone: "sage", text: "Saved" });
    } catch (e) { handle(e); }
  };

  if (!data) return <Spinner />;
  const bySection = PROFILE_SECTIONS.map((s) => ({ s, entries: data.entries.filter((e) => e.section === s) })).filter((g) => g.entries.length);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        {data.notes.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
        <div className="flex flex-wrap gap-2">
          <Button onClick={runSuggest} loading={busy === "suggest"}><Sparkles className="size-4" aria-hidden /> Suggest entries from my documents</Button>
        </div>
        {suggest && (
          <Card>
            <h2 className="text-lg">Suggestions {suggest.demo && <Badge tone="warn">demo rules</Badge>}</h2>
            <p className="mt-1 text-sm text-ink-2">Nothing is added until you accept it. Each suggestion was checked: quotes exist and confidence matches the evidence.</p>
            {suggest.entries.length === 0 && <p className="mt-2 text-sm">No new entries found.</p>}
            <ul className="mt-3 space-y-2">
              {suggest.entries.map((e, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-line p-3">
                  <input type="checkbox" aria-label="Accept this suggestion" className="mt-1" checked={suggest.chosen.has(i)} onChange={(ev) => {
                    const next = new Set(suggest.chosen);
                    if (ev.target.checked) next.add(i); else next.delete(i);
                    setSuggest({ ...suggest, chosen: next });
                  }} />
                  <div className="min-w-0 text-sm">
                    <p>{e.statement}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5"><Badge>{sectionLabel(e.section)}</Badge><ProvenanceBadge p={e.provenance} confidence={e.confidence} /></div>
                    {e.evidence.map((ev, j) => ev.quote && <p key={j} className="mt-1 text-xs text-ink-3">“{ev.quote}” · {name(ev.materialId ?? undefined)}</p>)}
                  </div>
                </li>
              ))}
            </ul>
            {suggest.gaps.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-ink-2">{suggest.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
            <div className="mt-3 flex gap-2">
              <Button variant="primary" loading={busy === "add"} disabled={!suggest.chosen.size} onClick={() => addEntries(suggest.entries.filter((_, i) => suggest.chosen.has(i)))}>Add {suggest.chosen.size} selected</Button>
              <Button variant="ghost" onClick={() => setSuggest(null)}>Discard</Button>
            </div>
          </Card>
        )}
        {problems.length > 0 && <Notice tone="danger" title="Not added: these honesty rules failed"><ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice>}
        {bySection.length === 0 ? (
          <EmptyState icon={<GraduationCap className="size-6" />} title="Your course profile is empty">Add what you know about your course, or let the app suggest entries from confirmed documents.</EmptyState>
        ) : bySection.map((g) => (
          <Card key={g.s}>
            <h2 className="text-base font-semibold">{sectionLabel(g.s)}</h2>
            <ul className="mt-2 divide-y divide-line">
              {g.entries.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm">{e.statement}</p>
                    <button aria-label="Delete entry" className="text-ink-3 hover:text-danger" onClick={() => remove(e.id)}><Trash2 className="size-4" /></button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5"><ProvenanceBadge p={e.provenance} confidence={e.confidence} />{e.userEdited && <Badge>edited by you</Badge>}</div>
                  {e.evidence.map((ev, j) => (
                    <p key={j} className="mt-1 text-xs text-ink-3">
                      {ev.quote && <>“{ev.quote}” · </>}{ev.materialId && <Link className="underline" href={`/abitur/examiner/materials/${ev.materialId}`}>{name(ev.materialId)}</Link>}
                      {ev.url && <a className="inline-flex items-center gap-1 underline" href={ev.url} target="_blank" rel="noreferrer noopener">{ev.url} <ExternalLink className="size-3" aria-hidden /></a>}
                    </p>
                  ))}
                  {e.problems.length > 0 && <p className="mt-1 text-xs text-danger">No longer supported: {e.problems.join(" ")}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <AddEntry materials={materials.filter((m) => m.docType)} onAdd={(e) => addEntries([e])} />
      </div>
      <div className="space-y-4">
        <CourseCard course={data.course} onSave={saveCourse} />
        <GuidanceCard course={data.course} onSave={saveCourse} />
        <Card>
          <h2 className="text-base font-semibold">What the labels mean</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {PROVENANCE.map((p) => <li key={p}><ProvenanceBadge p={p} /> {{
              teacher_explicit: "Quoted word for word from a teacher document.",
              observed_pattern: "Seen in your documents. One document = provisional.",
              official_guidance: "From an official document you opened (link required).",
              general_principle: "Good practice, not your teacher's rule.",
              ai_suggestion: "A recommendation. Optional.",
            }[p]}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AddEntry({ materials, onAdd }: { materials: MaterialRow[]; onAdd: (e: unknown) => Promise<boolean> }) {
  const [f, setF] = useState({ section: "other", statement: "", provenance: "general_principle", confidence: "medium", materialId: "", quote: "", url: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const evidence = [...(f.materialId ? [{ materialId: f.materialId, quote: f.quote || null }] : []), ...(f.url ? [{ url: f.url }] : [])];
    if (await onAdd({ section: f.section, statement: f.statement, provenance: f.provenance, confidence: f.confidence, evidence })) setF({ ...f, statement: "", quote: "", url: "" });
  };
  return (
    <Card>
      <h2 className="text-base font-semibold">Add an entry yourself</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Section" htmlFor="ae-sec"><Select id="ae-sec" value={f.section} onChange={set("section")}>{PROFILE_SECTIONS.map((s) => <option key={s} value={s}>{sectionLabel(s)}</option>)}</Select></Field>
        <Field label="Where does it come from?" htmlFor="ae-prov"><Select id="ae-prov" value={f.provenance} onChange={set("provenance")}>{PROVENANCE.map((p) => <option key={p} value={p}>{PROVENANCE_LABEL[p]}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Statement" htmlFor="ae-st"><Textarea id="ae-st" rows={2} value={f.statement} onChange={set("statement")} placeholder="e.g. Comments must include a counterargument." /></Field></div>
        <Field label="Confidence" htmlFor="ae-conf"><Select id="ae-conf" value={f.confidence} onChange={set("confidence")}>{CONFIDENCE.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="Evidence document" htmlFor="ae-doc"><Select id="ae-doc" value={f.materialId} onChange={set("materialId")}><option value="">None</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}</Select></Field>
        {f.materialId && <div className="sm:col-span-2"><Field label="Quote from that document (word for word)" htmlFor="ae-q"><Input id="ae-q" value={f.quote} onChange={set("quote")} /></Field></div>}
        {f.provenance === "official_guidance" && <div className="sm:col-span-2"><Field label="Link to the official document" htmlFor="ae-url"><Input id="ae-url" type="url" value={f.url} onChange={set("url")} placeholder="https://" /></Field></div>}
      </div>
      <Button className="mt-3" onClick={submit} disabled={f.statement.trim().length < 3}>Add entry</Button>
    </Card>
  );
}

function CourseCard({ course, onSave }: { course: Course; onSave: (p: Record<string, unknown>) => void }) {
  const [c, setC] = useState({ yearLevel: course.yearLevel ?? "", courseLevel: course.courseLevel ?? "", preferredFormat: course.preferredFormat ?? "" });
  return (
    <Card>
      <h2 className="text-base font-semibold">Your course</h2>
      <div className="mt-3 space-y-3">
        <Field label="Year level" htmlFor="c-y"><Input id="c-y" value={c.yearLevel} onChange={(e) => setC({ ...c, yearLevel: e.target.value })} placeholder="e.g. Q12" /></Field>
        <Field label="Course" htmlFor="c-l"><Input id="c-l" value={c.courseLevel} onChange={(e) => setC({ ...c, courseLevel: e.target.value })} placeholder="e.g. Leistungsfach (eA)" /></Field>
        <Field label="Preferred exam format" htmlFor="c-f"><Input id="c-f" value={c.preferredFormat} onChange={(e) => setC({ ...c, preferredFormat: e.target.value })} placeholder="e.g. Schulaufgabe, 90 min" /></Field>
        <Button size="sm" onClick={() => onSave({ yearLevel: c.yearLevel || null, courseLevel: c.courseLevel || null, preferredFormat: c.preferredFormat || null })}>Save</Button>
      </div>
    </Card>
  );
}

function GuidanceCard({ course, onSave }: { course: Course; onSave: (p: Record<string, unknown>) => void }) {
  const [g, setG] = useState({ title: "", url: "", summary: "", verified: false });
  return (
    <Card>
      <h2 className="text-base font-semibold">Official guidance you checked</h2>
      <p className="mt-1 text-sm text-ink-2">E.g. ISB documents on the English Abitur. Mark a document as read only after you opened it; Abitur-level exams note when nothing is verified.</p>
      <ul className="mt-2 space-y-2">
        {course.officialGuidance.map((x, i) => (
          <li key={i} className="text-sm">
            <a className="underline" href={x.url} target="_blank" rel="noreferrer noopener">{x.title}</a> {x.verified ? <Badge tone="sage">read</Badge> : <Badge tone="warn">not verified</Badge>}
            {x.summary && <p className="text-xs text-ink-3">{x.summary}</p>}
            <button className="text-xs text-danger underline" onClick={() => onSave({ removeGuidance: i })}>remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <Input aria-label="Title" placeholder="Title" value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} />
        <Input aria-label="Link" type="url" placeholder="https://" value={g.url} onChange={(e) => setG({ ...g, url: e.target.value })} />
        <Textarea aria-label="Summary" rows={2} placeholder="What does it say?" value={g.summary} onChange={(e) => setG({ ...g, summary: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.verified} onChange={(e) => setG({ ...g, verified: e.target.checked })} /> I opened and read this document</label>
        <Button size="sm" disabled={g.title.length < 3 || !/^https?:\/\//.test(g.url)} onClick={() => { onSave({ addGuidance: g }); setG({ title: "", url: "", summary: "", verified: false }); }}>Add</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- exams

function Exams() {
  const [rows, setRows] = useState<ExamRow[] | null>(null);
  useEffect(() => void api<{ exams: ExamRow[] }>("/api/examiner/exams").then((r) => setRows(r.exams)), []);
  if (!rows) return <Spinner />;
  if (!rows.length) return <EmptyState icon={<GraduationCap className="size-6" />} title="No exams yet" action={<LinkButton href="/abitur/examiner/new" variant="primary">Create an exam</LinkButton>}>Exams are generated from a blueprint: topic, difficulty, time and the format of your course.</EmptyState>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={`/abitur/examiner/exams/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
            <p className="text-xs text-ink-3">{e.tasks} task{e.tasks === 1 ? "" : "s"} · {e.durationMinutes} min · {new Date(e.createdAt).toLocaleDateString()}</p>
          </div>
          {e.isDemo && <Badge tone="warn">demo</Badge>}
          <Badge>{DIFFICULTY_LABEL[e.difficulty]}</Badge>
          {e.attempts.map((a) => <Link key={a.id} href={`/abitur/examiner/attempt/${a.id}`}><Badge tone={a.status === "submitted" ? "sage" : "accent"}>{a.status === "submitted" ? "submitted" : "in progress"}</Badge></Link>)}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- weaknesses

function Weaknesses() {
  const [w, setW] = useState<Weak | null>(null);
  useEffect(() => void api<Weak>("/api/examiner/weaknesses").then(setW), []);
  if (!w) return <Spinner />;
  const rec = w.recommendation;
  return (
    <div className="space-y-4">
      {w.demoAssessments > 0 && <Notice tone="warn">{w.demoAssessments} demo assessment{w.demoAssessments === 1 ? " is" : "s are"} not counted: demo mode only runs mechanical checks.</Notice>}
      <Card>
        <h2 className="text-lg">Recommendation</h2>
        <p className="mt-1 text-sm">Next exam: <strong>{DIFFICULTY_LABEL[rec.difficulty]}</strong></p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{rec.advice.map((a) => <li key={a}>{a}</li>)}</ul>
        {Object.keys(rec.drills).length > 0 && (
          <p className="mt-2 text-sm">Practise: {Object.entries(rec.drills).map(([s, n]) => `${rec.focus.find((f) => f.skill === s)?.label ?? s} (${n} short drill${n === 1 ? "" : "s"})`).join(" · ")}</p>
        )}
        <LinkButton className="mt-3" size="sm" href={`/abitur/examiner/new?difficulty=${rec.difficulty}`}>Create this exam</LinkButton>
      </Card>
      <Card>
        <h2 className="text-lg">Skills across your exams</h2>
        {w.skills.length === 0 ? <p className="mt-2 text-sm text-ink-2">No assessed exams yet. Skills appear after your first real assessment.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3"><th className="py-1.5 pr-3 font-medium">Skill</th><th className="pr-3 font-medium">Status</th><th className="pr-3 font-medium">Seen</th><th className="font-medium">Priority</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...w.skills].sort((a, b) => b.priority - a.priority).map((s) => (
                  <tr key={s.skill}>
                    <td className="py-2 pr-3">{s.label}</td>
                    <td className="pr-3"><Badge tone={s.status === "recurring" ? "danger" : s.status === "secure_provisional" ? "sage" : s.status === "improving" ? "accent" : "neutral"}>{WEAKNESS_STATUS[s.status]}</Badge></td>
                    <td className="pr-3 tabular-nums">{s.timesPresent} / {s.history.length}</td>
                    <td className="tabular-nums">{s.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-3">“Secure” needs three clean exams in a row and stays provisional.</p>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-lg">Estimates over time</h2>
        {w.results.length === 0 ? <p className="mt-2 text-sm text-ink-2">No results yet.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {w.results.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/abitur/examiner/assessment/${r.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">{r.title}{r.version > 1 ? ` (revision ${r.version})` : ""}</Link>
                <span className="text-xs text-ink-3">{new Date(r.date).toLocaleDateString()}</span>
                <PointsRange low={r.low} high={r.high} best={r.best} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-3">Indicative AI estimates (Bavarian 0–15 scale); revisions are not exam performance and do not change the recommendation.</p>
      </Card>
    </div>
  );
}
