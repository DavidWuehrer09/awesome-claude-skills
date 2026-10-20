"use client";

import { ArrowRight, Clock, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";

type Rec = { key: string; title: string; detail: string; href: string; kind: string };

export function Recommendations({ initial }: { initial: Rec[] }) {
  const [recs, setRecs] = useState(initial);
  const act = async (key: string, status: "dismissed" | "postponed" | "done") => {
    setRecs((r) => r.filter((x) => x.key !== key));
    await api("/api/recommendations", { method: "POST", json: { key, status } }).catch(() => {});
  };
  if (!recs.length) return <p className="mt-2 text-sm text-ink-3">Nothing pressing. Recommendations appear as you study and write.</p>;
  return (
    <ul className="mt-3 divide-y divide-line">
      {recs.map((r) => (
        <li key={r.key} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <Link href={r.href} onClick={() => void act(r.key, "done")} className="group flex items-center gap-2 font-medium text-ink hover:text-navy">
              {r.title} <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
            <p className="text-sm text-ink-2">{r.detail}</p>
          </div>
          <Badge tone={r.kind === "review" ? "navy" : r.kind === "writing" ? "accent" : r.kind === "abitur" ? "warn" : "sage"}>{r.kind}</Badge>
          <button type="button" title="Later" aria-label={`Postpone: ${r.title}`} onClick={() => act(r.key, "postponed")} className="rounded p-1 text-ink-3 hover:bg-surface-2"><Clock className="size-4" /></button>
          <button type="button" title="Dismiss" aria-label={`Dismiss: ${r.title}`} onClick={() => act(r.key, "dismissed")} className="rounded p-1 text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
        </li>
      ))}
    </ul>
  );
}
