"use client";

import { BookOpen, FolderTree, Hash, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Result = {
  entries: { id: string; headword: string; translationDe: string | null; definitionEn: string | null }[];
  topics: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(0);

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
      }).catch(() => setRes({ entries: [], topics: [], tags: [] }));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const shown = q.trim() ? res : null;
  const items = [
    ...(shown?.entries ?? []).map((e) => ({ key: `e${e.id}`, href: `/vocabulary/${e.id}`, label: e.headword, sub: e.translationDe ?? e.definitionEn ?? "", icon: BookOpen })),
    ...(shown?.topics ?? []).map((t) => ({ key: `t${t.id}`, href: `/vocabulary?topic=${t.id}`, label: t.name, sub: "Topic", icon: FolderTree })),
    ...(shown?.tags ?? []).map((t) => ({ key: `g${t.id}`, href: `/vocabulary?tag=${encodeURIComponent(t.name)}`, label: `#${t.name}`, sub: "Tag", icon: Hash })),
  ];
  const go = (href: string) => {
    onClose();
    setQ("");
    router.push(href);
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
          placeholder="Search words, meanings, collocations, examples…"
          aria-label="Search query"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
        {q && shown && !items.length && <li className="px-3 py-6 text-center text-sm text-ink-3">No matches in your vocabulary.</li>}
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === active}>
            <button type="button" onClick={() => go(it.href)} onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}>
              <it.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium">{it.label}</span>
                <span className="block truncate text-sm text-ink-3">{it.sub}</span>
              </span>
            </button>
          </li>
        ))}
        {!q && <li className="px-3 py-4 text-sm text-ink-3">Tip: press ⌘K / Ctrl K anywhere to search.</li>}
      </ul>
    </dialog>
  );
}
