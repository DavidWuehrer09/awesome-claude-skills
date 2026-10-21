"use client";

import clsx from "clsx";
import { FolderTree, Import, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { QuickAdd } from "@/components/vocab/quick-add";
import { TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, EmptyState, Input, LinkButton, PageHeader, Spinner, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Entry = {
  id: string; headword: string; partOfSpeech: string | null; translationDe: string | null; definitionEn: string | null; favorite: boolean; isSample: boolean;
  state: { state: number; due: string; lapses: number; stability: number; introducedAt: string | null; markedDifficult: boolean } | null;
};

const LISTS = [
  { value: "all", label: "All words" },
  { value: "recent", label: "Recently imported" },
  { value: "new", label: "Not yet learned" },
  { value: "due", label: "Due for revision" },
  { value: "difficult", label: "Difficult" },
  { value: "forgotten", label: "Repeatedly forgotten" },
  { value: "mastered", label: "Long-term" },
  { value: "favorites", label: "Favourites" },
];

function statusOf(e: Entry) {
  const s = e.state;
  if (!s || !s.introducedAt) return { label: "New", tone: "neutral" as const };
  if (s.markedDifficult || s.lapses >= 3) return { label: "Difficult", tone: "danger" as const };
  if (new Date(s.due).getTime() <= Date.now()) return { label: "Due", tone: "accent" as const };
  if (s.stability >= 60) return { label: "Long-term", tone: "sage" as const };
  return { label: "Learning", tone: "navy" as const };
}

export function VocabularyBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [items, setItems] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(params.get("add") === "1");
  const [bulkTopic, setBulkTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = params.get("list") ?? "all";
  const topic = params.get("topic") ?? "";
  const tag = params.get("tag") ?? "";

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`/vocabulary?${p.toString()}`);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({ list, ...(topic ? { topic } : {}), ...(tag ? { tag } : {}), ...(q ? { q } : {}) });
      const [v, t] = await Promise.all([api<{ items: Entry[]; total: number }>(`/api/vocab?${qs}`), api<{ topics: TopicNode[] }>("/api/topics")]);
      setItems(v.items);
      setTotal(v.total);
      setTopics(t.topics);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [list, topic, tag, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const bulk = async (action: "delete" | "add" | "remove" | "favorite") => {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} word(s) and their learning history? This cannot be undone.`)) return;
    try {
      const body = action === "favorite" ? { action, ids, value: true } : action === "delete" ? { action, ids } : { action, ids, topicId: bulkTopic || topic };
      if ((action === "add" || action === "remove") && !body.topicId) {
        toast({ tone: "warn", text: "Choose a topic first" });
        return;
      }
      const r = await api<{ affected: number }>("/api/vocab/bulk", { method: "POST", json: body });
      toast({ tone: "sage", text: `${r.affected} word(s) updated` });
      setSelected(new Set());
      void load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  const currentTopic = topic ? findTopic(topics, topic) : null;

  return (
    <>
      <PageHeader title="My Vocabulary" subtitle={currentTopic ? `Topic: ${currentTopic.name}` : tag ? `Tag: #${tag}` : "Your personal dictionary: every word, its meaning, and how well you know it."}
        actions={<>
          <LinkButton href="/vocabulary/topics"><FolderTree className="size-4" aria-hidden /> Topics</LinkButton>
          <LinkButton href="/vocabulary/import"><Import className="size-4" aria-hidden /> Import</LinkButton>
          <Button variant="primary" onClick={() => setAddOpen(true)}><Plus className="size-4" aria-hidden /> Add word</Button>
        </>} />

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside className="space-y-4">
          <nav aria-label="Lists" className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col">
            {LISTS.map((l) => (
              <button key={l.value} type="button" onClick={() => setParam("list", l.value === "all" ? "" : l.value)} aria-current={list === l.value ? "true" : undefined}
                className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-left text-sm", list === l.value ? "bg-navy/10 font-medium text-navy" : "text-ink-2 hover:bg-surface-2")}>
                {l.label}
              </button>
            ))}
          </nav>
          <div className="hidden lg:block">
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-ink-3">Topics</p>
            <TopicTree nodes={topics} active={topic} onPick={(id) => setParam("topic", id === topic ? "" : id)} />
          </div>
          <div className="lg:hidden">
            <TopicSelect topics={topics} value={topic} onChange={(v) => setParam("topic", v)} placeholder="All topics" />
          </div>
        </aside>

        <section aria-label="Words" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by word, meaning, collocation…" aria-label="Filter words" className="max-w-sm" />
            <span className="text-sm text-ink-3">{total} word{total === 1 ? "" : "s"}</span>
          </div>
          {selected.size > 0 && (
            <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-sm">
              <span className="px-1 text-sm font-medium">{selected.size} selected</span>
              <div className="w-48"><TopicSelect topics={topics} value={bulkTopic} onChange={setBulkTopic} placeholder="Choose topic…" /></div>
              <Button size="sm" onClick={() => bulk("add")}>Add to topic</Button>
              <Button size="sm" onClick={() => bulk("remove")}>Remove from topic</Button>
              <Button size="sm" onClick={() => bulk("favorite")}><Star className="size-4" aria-hidden /> Favourite</Button>
              <Button size="sm" onClick={() => router.push(`/learn/session?mode=practice&ids=${[...selected].join(",")}`)}>Practise</Button>
              <Button size="sm" variant="danger" onClick={() => bulk("delete")}><Trash2 className="size-4" aria-hidden /> Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          {error && <p className="text-danger" role="alert">{error} <button className="underline" onClick={load}>Retry</button></p>}
          {!items && !error && <Spinner />}
          {items && items.length === 0 && (
            <EmptyState title={q || topic || list !== "all" ? "No words match" : "No words yet"} action={<><LinkButton href="/vocabulary/import" variant="primary">Import a list</LinkButton><Button onClick={() => setAddOpen(true)}>Add a word</Button></>}>
              {q || topic || list !== "all" ? "Try another filter." : "Paste a list from school, upload a file or photo, or add words one by one."}
            </EmptyState>
          )}
          {items && items.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {items.map((e) => {
                const st = statusOf(e);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.headword}`} className="size-4 accent-[var(--navy)]" />
                    <Link href={`/vocabulary/${e.id}`} className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-display text-[17px] text-ink">{e.headword}</span>
                        {e.partOfSpeech && <span className="text-xs text-ink-3">{e.partOfSpeech}</span>}
                        {e.favorite && <Star className="size-3.5 fill-accent text-accent" aria-label="Favourite" />}
                      </span>
                      <span className="block truncate text-sm text-ink-2">{e.translationDe ?? e.definitionEn ?? "No meaning yet"}</span>
                    </Link>
                    {e.isSample && <Badge>sample</Badge>}
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <QuickAdd key={topic} open={addOpen} onClose={() => setAddOpen(false)} topics={topics} defaultTopic={topic} onCreated={(id) => { setAddOpen(false); router.push(`/vocabulary/${id}?new=1`); }} />
    </>
  );
}

function findTopic(nodes: TopicNode[], id: string): TopicNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const c = findTopic(n.children, id);
    if (c) return c;
  }
  return null;
}

function TopicTree({ nodes, active, onPick, depth = 0 }: { nodes: TopicNode[]; active: string; onPick: (id: string) => void; depth?: number }) {
  if (!nodes.length && depth === 0) return <p className="px-3 text-sm text-ink-3">No topics yet.</p>;
  return (
    <ul className={depth ? "ml-3 border-l border-line pl-1" : ""}>
      {nodes.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onPick(n.id)} aria-current={active === n.id ? "true" : undefined}
            className={clsx("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm", active === n.id ? "bg-navy/10 font-medium text-navy" : "text-ink-2 hover:bg-surface-2")}>
            <span className="truncate">{n.name}</span>
            <span className="text-xs text-ink-3">{n.count}</span>
          </button>
          {n.children.length > 0 && <TopicTree nodes={n.children} active={active} onPick={onPick} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
