"use client";

import { ArrowLeft, Merge, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { flattenTopics, TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function TopicsPage() {
  const toast = useToast();
  const [topics, setTopics] = useState<TopicNode[] | null>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [kind, setKind] = useState<"topic" | "collection">("topic");
  const [edit, setEdit] = useState<(TopicNode & { depth: number }) | null>(null);
  const [editName, setEditName] = useState("");
  const [editParent, setEditParent] = useState("");
  const [mergeFrom, setMergeFrom] = useState<TopicNode | null>(null);
  const [mergeTo, setMergeTo] = useState("");

  const load = useCallback(() => api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch((e) => toast({ tone: "danger", text: errorMessage(e) })), [toast]);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ tone: "sage", text: ok });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  const flat = topics ? flattenTopics(topics) : [];

  return (
    <>
      <Link href="/vocabulary" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Vocabulary</Link>
      <PageHeader title="Topics and collections" subtitle="Rename, nest, merge and delete. Deleting a topic never deletes its words." />
      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(() => api("/api/topics", { method: "POST", json: { name, parentId: parent || null, kind } }), "Topic created").then(() => setName(""));
        }}>
          <Field label="New topic or collection" htmlFor="tname"><Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The American Dream" /></Field>
          <Field label="Inside (optional)" htmlFor="tparent"><TopicSelect id="tparent" topics={topics ?? []} value={parent} onChange={setParent} placeholder="Top level" /></Field>
          <Field label="Type" htmlFor="tkind">
            <Select id="tkind" value={kind} onChange={(e) => setKind(e.target.value as "topic" | "collection")}><option value="topic">Topic</option><option value="collection">Collection</option></Select>
          </Field>
          <Button type="submit" variant="primary"><Plus className="size-4" aria-hidden /> Create</Button>
        </form>
      </Card>
      {!topics && <Spinner />}
      {topics && !flat.length && <EmptyState title="No topics yet">Topics are created automatically when you import a list with headings, or here.</EmptyState>}
      {flat.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {flat.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ paddingLeft: `${16 + t.depth * 22}px` }}>
              <Link href={`/vocabulary?topic=${t.id}`} className="min-w-0 flex-1 truncate hover:text-navy">{t.depth ? "↳ " : ""}{t.name}</Link>
              {t.kind === "collection" && <Badge tone="navy">collection</Badge>}
              {t.isSample && <Badge>sample</Badge>}
              <span className="text-sm text-ink-3">{t.count} words</span>
              <Button size="sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => { setEdit(t); setEditName(t.name); setEditParent(t.parentId ?? ""); }}><Pencil className="size-4" /></Button>
              <Button size="sm" variant="ghost" aria-label={`Merge ${t.name} into another topic`} onClick={() => { setMergeFrom(t); setMergeTo(""); }}><Merge className="size-4" /></Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete topic “${t.name}”? Its words stay in your vocabulary; subtopics move up one level.`) && run(() => api(`/api/topics/${t.id}`, { method: "DELETE" }), "Topic deleted")}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Edit topic"
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={() => edit && run(() => api(`/api/topics/${edit.id}`, { method: "PATCH", json: { name: editName, parentId: editParent || null } }), "Topic updated").then(() => setEdit(null))}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" htmlFor="ename"><Input id="ename" value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
          <Field label="Move inside" htmlFor="eparent" hint="Choose “Top level” to make it a main topic."><TopicSelect id="eparent" topics={(topics ?? []).filter((t) => t.id !== edit?.id)} value={editParent} onChange={setEditParent} placeholder="Top level" /></Field>
        </div>
      </Dialog>
      <Dialog open={!!mergeFrom} onClose={() => setMergeFrom(null)} title={`Merge “${mergeFrom?.name ?? ""}” into…`}
        footer={<><Button onClick={() => setMergeFrom(null)}>Cancel</Button><Button variant="primary" disabled={!mergeTo} onClick={() => mergeFrom && run(() => api("/api/topics/merge", { method: "POST", json: { sourceId: mergeFrom.id, targetId: mergeTo } }), "Topics merged").then(() => setMergeFrom(null))}>Merge</Button></>}>
        <p className="mb-3 text-sm text-ink-2">All words and subtopics move to the target; “{mergeFrom?.name}” is removed. Words are never duplicated.</p>
        <TopicSelect topics={(topics ?? []).filter((t) => t.id !== mergeFrom?.id)} value={mergeTo} onChange={setMergeTo} placeholder="Choose target topic" allowNone />
      </Dialog>
    </>
  );
}
