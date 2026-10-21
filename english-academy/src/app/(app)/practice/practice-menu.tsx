"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui";
import { TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { PRACTICE_MODES, sessionModeHref } from "@/domain/learning/modes";
import { api } from "@/lib/api";

/** The practice modes with one topic picker for all deterministic (session) modes. */
export function PracticeMenu() {
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [topic, setTopic] = useState("");

  useEffect(() => {
    api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch(() => {});
  }, []);

  return (
    <>
      <div className="mb-4 max-w-sm">
        <Field label="Topic for the non-AI modes" htmlFor="practice-topic">
          <TopicSelect id="practice-topic" topics={topics} value={topic} onChange={setTopic} placeholder="All my words" />
        </Field>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRACTICE_MODES.map((m, i) => (
          <li key={m.slug}>
            <Link href={m.ai ? `/practice/${m.slug}` : (sessionModeHref(m, topic || null) ?? "/practice")}
              className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] transition-colors hover:border-navy">
              <span className="flex items-center gap-2 text-xs text-ink-3">Mode {i + 1}{m.ai && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent"><Sparkles className="size-3" aria-hidden /> AI</span>}</span>
              <span className="mt-1 font-display text-lg text-ink">{m.title}</span>
              <span className="mt-1 text-sm text-ink-2">{m.description}</span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
