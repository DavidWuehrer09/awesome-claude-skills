"use client";

import { Select } from "@/components/ui";

export type TopicNode = { id: string; name: string; parentId: string | null; count: number; children: TopicNode[]; kind: string; isSample?: boolean };

export function flattenTopics(nodes: TopicNode[], depth = 0): (TopicNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenTopics(n.children, depth + 1)]);
}

export function TopicSelect({ topics, value, onChange, placeholder = "No topic", id, allowNone = true }: {
  topics: TopicNode[]; value: string; onChange: (v: string) => void; placeholder?: string; id?: string; allowNone?: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">{placeholder}</option>}
      {flattenTopics(topics).map((t) => (
        <option key={t.id} value={t.id}>{"  ".repeat(t.depth)}{t.depth ? "↳ " : ""}{t.name}</option>
      ))}
    </Select>
  );
}
