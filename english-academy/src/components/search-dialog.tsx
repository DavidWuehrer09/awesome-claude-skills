"use client";

import clsx from "clsx";
import { BookOpen, FileText, FolderPlus, FolderTree, Hash, Plus, Search, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "./ui";
import { openQuickAdd } from "./vocab/quick-add";
import { TopicSelect, type TopicNode } from "./vocab/topic-select";

type Result = {
  entries: { id: string; headword: string; translationDe: string | null; definitionEn: string | null }[];
  topics: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  drafts: { id: string; title: string; snippet: string }[];
};
type Kind = "all" | "word" | "topic" | "tag" | "writing";

const FILTERS: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "word", label: "Words" },
  { value: "topic", label: "Topics" },
  { value: "tag", label: "Tags" },
  { value: "writing", label: "Writing" },
];

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(0);
  const [kind, setKind] = useState<Kind>("all");
  const [topics, setTopics] = useState<TopicNode[] | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => input.current?.focus(), 10);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      api<Result>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => {
        setRes(r);
        setActive(0);
      }).catch(() => setRes({ entries: [], topics: [], tags: [], drafts: [] }));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const shown = q.trim() ? res : null;
  const want = (k: Kind) => kind === "all" || kind === k;
  const items = [
    ...(want("word") ? shown?.entries ?? [] : []).map((e) => ({ key: `e${e.id}`, entryId: e.id, href: `/vocabulary/${e.id}`, label: e.headword, sub: e.translationDe ?? e.definitionEn ?? "", icon: BookOpen })),
    ...(want("topic") ? shown?.topics ?? [] : []).map((t) => ({ key: `t${t.id}`, entryId: null, href: `/vocabulary?topic=${t.id}`, label: t.name, sub: "Topic", icon: FolderTree })),
    ...(want("tag") ? shown?.tags ?? [] : []).map((t) => ({ key: `g${t.id}`, entryId: null, href: `/vocabulary?tag=${encodeURIComponent(t.name)}`, label: `#${t.name}`, sub: "Tag", icon: Hash })),
    ...(want("writing") ? shown?.drafts ?? [] : []).map((d) => ({ key: `d${d.id}`, entryId: null, href: `/writing/${d.id}`, label: d.title, sub: d.snippet || "Writing draft", icon: FileText })),
  ];
  const count = (k: Kind) => (!shown ? 0 : k === "word" ? shown.entries.length : k === "topic" ? shown.topics.length : k === "tag" ? shown.tags.length : k === "writing" ? (shown.drafts?.length ?? 0) : 0);
  const reset = () => {
    setQ("");
    setAddTo(null);
  };
  const go = (href: string) => {
    onClose();
    reset();
    router.push(href);
  };
  const startAddTo = (id: string) => {
    setAddTo(addTo === id ? null : id);
    if (!topics) api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch(() => setTopics([]));
  };
  const addToTopic = async (entryId: string, topicId: string) => {
    if (!topicId) return;
    try {
      await api("/api/vocab/bulk", { method: "POST", json: { action: "add", ids: [entryId], topicId } });
      toast({ tone: "sage", text: "Added to the topic" });
      setAddTo(null);
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search"
      className="mx-auto mt-[10vh] w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="size-5 text-ink-3" aria-hidden />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter" && items[active]) go(items[active].href);
          }}
          placeholder="Search words, meanings, collocations, examples, writing…"
          aria-label="Search query"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
      </div>
      {q && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2" role="group" aria-label="Result type">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={kind === f.value} onClick={() => { setKind(f.value); setActive(0); }}
              className={clsx("shrink-0 rounded-full border px-3 py-0.5 text-xs", kind === f.value ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-2 hover:border-line-strong")}>
              {f.label}{f.value !== "all" && shown ? ` ${count(f.value)}` : ""}
            </button>
          ))}
        </div>
      )}
      <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
        {q && shown && !items.length && <li className="px-3 py-6 text-center text-sm text-ink-3">No matches{kind === "all" ? " in your vocabulary or writing" : " of this type"}.</li>}
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} className={clsx("rounded-lg", i === active && "bg-surface-2")}>
            <div className="flex items-center gap-1 pr-1">
              <button type="button" onClick={() => go(it.href)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                <it.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.label}</span>
                  <span className="block truncate text-sm text-ink-3">{it.sub}</span>
                </span>
              </button>
              {it.entryId && (
                <>
                  <button type="button" title="Practise" aria-label={`Practise ${it.label}`} onClick={() => go(`/learn/session?mode=practice&ids=${it.entryId}`)}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-surface hover:text-navy"><Target className="size-4" /></button>
                  <button type="button" title="Add to collection or topic" aria-label={`Add ${it.label} to a topic`} aria-expanded={addTo === it.entryId} onClick={() => startAddTo(it.entryId!)}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-surface hover:text-navy"><FolderPlus className="size-4" /></button>
                </>
              )}
            </div>
            {it.entryId && addTo === it.entryId && (
              <div className="px-3 pb-2">
                {topics ? (
                  topics.length
                    ? <TopicSelect topics={topics} value="" onChange={(v) => void addToTopic(it.entryId!, v)} placeholder="Add to collection or topic…" />
                    : <p className="text-sm text-ink-3">No topics yet. Create one under My Vocabulary → Topics.</p>
                ) : <p className="text-sm text-ink-3">Loading topics…</p>}
              </div>
            )}
          </li>
        ))}
        {q.trim() && (
          <li>
            <button type="button" onClick={() => { const w = q.trim(); onClose(); reset(); openQuickAdd(w); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2">
              <Plus className="size-4 shrink-0 text-ink-3" aria-hidden /> Add “{q.trim()}” as a new word
            </button>
          </li>
        )}
        {!q && <li className="px-3 py-4 text-sm text-ink-3">Tip: press ⌘K / Ctrl K anywhere to search.</li>}
      </ul>
    </dialog>
  );
}
