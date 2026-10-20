"use client";

import { Clock, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { TASK_TYPES } from "@/domain/writing/rubrics";
import { api, errorMessage } from "@/lib/api";

type LibItem = { key: string; section: string; taskType: string; title: string; instructions: string; minWords?: number; maxWords?: number; timeLimitMinutes?: number; hasSource: boolean; topic: string };
type LabItem = { key: string; focus: string; sentence: string };
type Entry = { id: string; headword: string };

const SECTION_TITLE: Record<string, string> = {
  sentence: "Sentence Laboratory", paragraph: "Paragraph Workshop", vocab_context: "Academic Vocabulary in Context", argument: "Argumentation Studio",
  refinement: "Stylistic Refinement", editing: "Editing and Proofreading", timed: "Timed Writing", essay: "Full Essay Practice", abitur: "Abitur Academy",
};
const FOCUS_MATCH: Record<string, string[]> = {
  word_choice: ["Precision"], concision: ["Concision", "Redundancy"], sentence_structure: ["Combining", "Syntax"], register: ["Register"],
  collocations: ["Collocation"], argumentation: ["hedging"], cohesion: ["Transitions"],
};

export function NewWritingTask() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const section = params.get("section") ?? "essay";
  const focus = params.get("focus");
  const [lib, setLib] = useState<LibItem[]>([]);
  const [lab, setLab] = useState<LabItem[]>([]);
  const [tab, setTab] = useState<"library" | "ai" | "own">("library");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // AI / own form state
  const [taskType, setTaskType] = useState(section === "paragraph" || section === "vocab_context" ? "paragraph" : section === "sentence" ? "sentence" : "comment");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("C1");
  const [minutes, setMinutes] = useState(section === "timed" ? 30 : 0);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [source, setSource] = useState("");
  const [minWords, setMinWords] = useState("");
  const [maxWords, setMaxWords] = useState("");
  // vocab-in-context
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [vTopic, setVTopic] = useState(params.get("topic") ?? "");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(params.get("words")?.split(",").filter(Boolean) ?? []));

  useEffect(() => {
    api<{ library: LibItem[]; sentenceLab: LabItem[] }>("/api/writing/prompts").then((r) => { setLib(r.library); setLab(r.sentenceLab); }).catch((e) => setError(errorMessage(e)));
    api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch(() => {});
  }, []);
  useEffect(() => {
    if (section !== "vocab_context" && section !== "paragraph") return;
    api<{ items: Entry[] }>(`/api/vocab?limit=80${vTopic ? `&topic=${vTopic}` : ""}`).then((r) => {
      setEntries(r.items);
      if (!params.get("words")) setPicked(new Set(r.items.slice(0, 5).map((e) => e.id)));
    }).catch(() => {});
  }, [section, vTopic, params]);

  const libraryForSection = useMemo(() => {
    const s = section === "essay" ? ["essay", "abitur"] : section === "timed" ? ["timed", "abitur"] : [section];
    return lib.filter((l) => s.includes(l.section));
  }, [lib, section]);
  const labItems = useMemo(() => {
    if (!focus || !FOCUS_MATCH[focus]) return lab;
    const match = lab.filter((l) => FOCUS_MATCH[focus].some((f) => l.focus.includes(f)));
    return match.length ? match : lab;
  }, [lab, focus]);

  const create = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ draft: { id: string } }>("/api/writing/prompts", { method: "POST", json: body });
      router.push(`/writing/${r.draft.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const vocabTask = () => {
    const words = entries.filter((e) => picked.has(e.id)).map((e) => e.headword);
    if (words.length < 2) return toast({ tone: "warn", text: "Choose at least two words" });
    const topicName = topic || "a topic of your choice from your course";
    void create({
      origin: "user", section: "vocab_context", taskType: "paragraph",
      title: `Vocabulary in context: ${words.slice(0, 3).join(", ")}${words.length > 3 ? "…" : ""}`,
      instructions: `Write one well-structured paragraph (120–180 words) about ${topicName}. Use at least ${Math.min(4, words.length)} of these expressions where they genuinely fit your argument: ${words.join(", ")}. Do not force a word into a sentence where it does not belong; feedback will tell you which uses worked.`,
      minWords: 120, maxWords: 180, targetEntryIds: [...picked],
    }, "vocab");
  };

  return (
    <>
      <PageHeader eyebrow="Writing Lab" title={SECTION_TITLE[section] ?? "New writing task"} />
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      {section === "sentence" && (
        <Card className="mb-6">
          <h2 className="text-lg">Sentence Laboratory {focus && <Badge tone="accent">focus: {focus.replace("_", " ")}</Badge>}</h2>
          <p className="mt-1 text-sm text-ink-2">Improve one sentence at a time. You will see a model and an explanation after your attempt.</p>
          <ul className="mt-4 space-y-2">
            {labItems.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <Badge>{l.focus}</Badge>
                <span className="min-w-0 flex-1 font-display">{l.sentence}</span>
                <Button size="sm" loading={busy === l.key} onClick={() => create({ origin: "lab", key: l.key}, l.key)}>Work on it</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(section === "vocab_context" || section === "paragraph") && (
        <Card className="mb-6 space-y-4">
          <h2 className="text-lg">{section === "vocab_context" ? "Choose your target vocabulary" : "Paragraph with target vocabulary (optional)"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Take words from" htmlFor="vt"><TopicSelect id="vt" topics={topics} value={vTopic} onChange={setVTopic} placeholder="All words" /></Field>
            <Field label="What should the paragraph be about?" htmlFor="vtopic"><Input id="vtopic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. whether voting should be compulsory" /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {entries.map((e) => (
              <label key={e.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${picked.has(e.id) ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-2"}`}>
                <input type="checkbox" className="sr-only" checked={picked.has(e.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s);
                  if (n.has(e.id)) n.delete(e.id);
                  else if (n.size < 8) n.add(e.id);
                  return n;
                })} />{e.headword}
              </label>
            ))}
            {!entries.length && <p className="text-sm text-ink-3">No words available in this selection.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === "vocab"} onClick={vocabTask}>Start paragraph task</Button>
            <Button loading={busy === "vocab-ai"} onClick={() => create({ origin: "ai", section: "vocab_context", taskType: "paragraph", topic: topic || "a current social or political issue", difficulty, targetEntryIds: [...picked] }, "vocab-ai")}>
              <Sparkles className="size-4" aria-hidden /> Let AI design the task
            </Button>
          </div>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} className="mb-4 w-fit" items={[
        { value: "library", label: "Ready-made prompts" }, { value: "ai", label: "Generate with AI" }, { value: "own", label: "My own task" },
      ]} />

      {tab === "library" && (
        <ul className="grid gap-3 md:grid-cols-2">
          {(libraryForSection.length ? libraryForSection : lib).map((l) => (
            <li key={l.key}>
              <Card className="flex h-full flex-col">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="navy">{TASK_TYPES.find((t) => t.id === l.taskType)?.label ?? l.taskType}</Badge>
                  {l.timeLimitMinutes && <Badge><Clock className="size-3" aria-hidden /> {l.timeLimitMinutes} min</Badge>}
                  {l.hasSource && <Badge tone="accent">with source text</Badge>}
                </div>
                <h3 className="mt-2 text-lg">{l.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-2">{l.instructions}</p>
                <div className="mt-3"><Button variant="primary" size="sm" loading={busy === l.key} onClick={() => create({ origin: "library", key: l.key, targetEntryIds: [...picked].slice(0, 8) }, l.key)}>Start</Button></div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {tab === "ai" && (
        <Card className="space-y-4">
          <p className="text-sm text-ink-2">The AI writes an original task (and an original source text where needed, clearly labelled as fictional). Nothing is copied from real exams.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Task type" htmlFor="tt"><Select id="tt" value={taskType} onChange={(e) => setTaskType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
            <Field label="Topic" htmlFor="topic"><Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. AI and the future of work" /></Field>
            <Field label="Difficulty" htmlFor="diff"><Select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>B2</option><option>C1</option><option>C2</option></Select></Field>
            <Field label="Time limit (0 = untimed)" htmlFor="min"><Input id="min" type="number" min={0} max={300} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          </div>
          <Button variant="primary" loading={busy === "ai"} disabled={topic.trim().length < 2}
            onClick={() => create({ origin: "ai", section, taskType, topic, difficulty, minutes: minutes || null, targetEntryIds: [...picked].slice(0, 8) }, "ai")}>
            <Sparkles className="size-4" aria-hidden /> Generate task
          </Button>
        </Card>
      )}

      {tab === "own" && (
        <Card className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title" htmlFor="ot"><Input id="ot" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Task type" htmlFor="ott"><Select id="ott" value={taskType} onChange={(e) => setTaskType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
          </div>
          <Field label="Instructions" htmlFor="oi"><Textarea id="oi" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <Field label="Source text (optional)" htmlFor="os" hint="Paste a text you are allowed to use for study, e.g. from class."><Textarea id="os" rows={5} value={source} onChange={(e) => setSource(e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Min words" htmlFor="omin"><Input id="omin" type="number" value={minWords} onChange={(e) => setMinWords(e.target.value)} /></Field>
            <Field label="Max words" htmlFor="omax"><Input id="omax" type="number" value={maxWords} onChange={(e) => setMaxWords(e.target.value)} /></Field>
            <Field label="Minutes" htmlFor="ominutes"><Input id="ominutes" type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          </div>
          <Button variant="primary" loading={busy === "own"} disabled={title.trim().length < 2 || instructions.trim().length < 5}
            onClick={() => create({
              origin: "user", section, taskType, title, instructions, sourceText: source || null,
              minWords: minWords ? Number(minWords) : null, maxWords: maxWords ? Number(maxWords) : null, timeLimitMinutes: minutes || null, targetEntryIds: [...picked].slice(0, 8),
            }, "own")}>Create task</Button>
        </Card>
      )}
    </>
  );
}
