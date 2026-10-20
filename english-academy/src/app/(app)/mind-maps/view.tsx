"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Edge, type Node } from "@xyflow/react";
import { Download, Eye, EyeOff, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopicSelect, type TopicNode } from "@/components/vocab/topic-select";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, Notice, PageHeader, Select, Spinner, useToast } from "@/components/ui";
import { LEVEL_LABEL, type MasteryLevel } from "@/domain/learning/mastery";
import { api, errorMessage } from "@/lib/api";

type MapNode = { id: string; kind: "topic" | "subtopic" | "word" | "label"; label: string; entryId?: string; partOfSpeech?: string | null; level?: string; meaning?: string | null };
type MapEdge = { id: string; source: string; target: string; relation: string; note?: string | null; origin: "structure" | "derived" | "ai" | "user"; linkId?: string };
type MapData = { topic: { id: string; name: string }; nodes: MapNode[]; edges: MapEdge[] };

const RELATIONS = ["synonym", "antonym", "family", "collocation", "related", "contrast", "confusable", "cause", "effect", "academic_phrase"] as const;
const LEVEL_COLOR: Record<string, string> = { new: "var(--line-strong)", learning: "var(--warn)", recognised: "var(--warn)", recalled: "var(--navy)", productive: "var(--sage)", mastered: "var(--sage)" };
const ORIGIN_COLOR: Record<string, string> = { structure: "var(--line-strong)", derived: "var(--ink-3)", ai: "var(--accent)", user: "var(--navy)" };

/** Radial layout: topic in the centre, subtopics on a ring, words around their subtopic, labels around words. */
function layout(map: MapData, collapsed: Set<string>) {
  const pos = new Map<string, { x: number; y: number }>();
  const root = map.nodes.find((n) => n.kind === "topic")!;
  pos.set(root.id, { x: 0, y: 0 });
  const subs = map.nodes.filter((n) => n.kind === "subtopic");
  const parentOf = new Map<string, string>();
  for (const e of map.edges) if (e.relation === "in topic" && !parentOf.has(e.target)) parentOf.set(e.target, e.source);
  const groups = [root.id, ...subs.map((s) => s.id)];
  subs.forEach((s, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, subs.length);
    const ring = Math.max(300, subs.length * 95); // grow with the number of branches, no further
    pos.set(s.id, { x: Math.cos(a) * ring, y: Math.sin(a) * ring });
  });
  for (const g of groups) {
    const words = map.nodes.filter((n) => n.kind === "word" && parentOf.get(n.id) === g);
    const c = pos.get(g)!;
    const radius = g === root.id ? 160 : 190;
    const base = Math.atan2(c.y, c.x) || 0;
    words.forEach((w, i) => {
      const spread = g === root.id ? 2 * Math.PI : Math.PI * 1.1;
      const a = g === root.id ? (spread * i) / Math.max(1, words.length) : base - spread / 2 + (spread * (i + 0.5)) / Math.max(1, words.length);
      pos.set(w.id, { x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius });
    });
  }
  const labels = map.nodes.filter((n) => n.kind === "label");
  for (const l of labels) {
    const from = map.edges.find((e) => e.target === l.id && pos.has(e.source));
    const c = from ? pos.get(from.source)! : { x: 0, y: 0 };
    const siblings = map.edges.filter((e) => from && e.source === from.source && map.nodes.find((n) => n.id === e.target)?.kind === "label");
    const i = siblings.findIndex((e) => e.target === l.id);
    const a = Math.atan2(c.y, c.x) - 1.2 + (2.4 * (i + 0.5)) / Math.max(1, siblings.length);
    const dist = 115 + (i % 2) * 40; // alternate distances so neighbouring labels do not overlap
    pos.set(l.id, { x: c.x + Math.cos(a) * dist, y: c.y + Math.sin(a) * dist });
  }
  const hidden = new Set<string>();
  for (const g of collapsed) for (const e of map.edges) if (e.source === g && e.relation !== "subtopic") hidden.add(e.target);
  return { pos, hidden };
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [topics, setTopics] = useState<TopicNode[] | null>(null);
  const topicId = params.get("topic") ?? "";
  const [map, setMap] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [relFilter, setRelFilter] = useState<Set<string>>(new Set(["synonym", "antonym", "family", "collocation", "contrast", "related", "confusable", "cause", "effect", "academic_phrase", "in topic", "subtopic"]));
  const [study, setStudy] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MapNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [linkForm, setLinkForm] = useState({ to: "", relation: "related", note: "" });

  useEffect(() => {
    api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch((e) => setError(errorMessage(e)));
  }, []);

  const load = useCallback(() => {
    if (!topicId) return Promise.resolve();
    return api<MapData>(`/api/mindmap?topic=${topicId}`)
      .then((m) => {
        setMap(m);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [topicId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!map) return;
    const { pos, hidden } = layout(map, collapsed);
    const visibleWord = (n: MapNode) => n.kind !== "word" || ((!levelFilter || n.level === levelFilter) && (!posFilter || n.partOfSpeech === posFilter));
    const shownNodes = map.nodes.filter((n) => !hidden.has(n.id) && visibleWord(n));
    const shownIds = new Set(shownNodes.map((n) => n.id));
    const shownEdges = map.edges.filter((e) => shownIds.has(e.source) && shownIds.has(e.target) && relFilter.has(e.relation === "in topic" || e.relation === "subtopic" ? e.relation : e.relation));
    const connected = new Set(shownEdges.flatMap((e) => [e.source, e.target]));
    setNodes(shownNodes.filter((n) => n.kind !== "label" || connected.has(n.id)).map((n) => {
      const hiddenLabel = study && n.kind === "word" && !revealed.has(n.id);
      return {
        id: n.id,
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <div className="leading-tight">
              <div className={n.kind === "word" ? "font-display text-[15px]" : n.kind === "label" ? "text-xs" : "font-display text-base font-semibold"}>
                {hiddenLabel ? (n.meaning ?? "?") : n.label}
              </div>
              {n.kind === "word" && !hiddenLabel && n.meaning && <div className="mt-0.5 max-w-[150px] truncate text-[10px] text-ink-3">{n.meaning}</div>}
              {(n.kind === "topic" || n.kind === "subtopic") && collapsed.has(n.id) && <div className="text-[10px] text-ink-3">(collapsed)</div>}
            </div>
          ),
        },
        style: {
          background: n.kind === "topic" ? "var(--navy)" : n.kind === "subtopic" ? "var(--surface-2)" : n.kind === "label" ? "transparent" : "var(--surface)",
          color: n.kind === "topic" ? "var(--navy-ink)" : "var(--ink)",
          border: n.kind === "label" ? "1px dashed var(--line-strong)" : `2px solid ${n.kind === "word" ? LEVEL_COLOR[n.level ?? "new"] : "var(--line)"}`,
          borderRadius: n.kind === "word" ? 12 : 999,
          padding: n.kind === "label" ? "2px 8px" : "6px 12px",
          width: "auto",
          minWidth: n.kind === "label" ? 0 : 90,
          fontSize: 13,
        },
      } satisfies Node;
    }));
    setEdges(shownEdges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      label: e.relation === "in topic" || e.relation === "subtopic" ? undefined : e.relation.replace("_", " "),
      labelStyle: { fontSize: 10, fill: "var(--ink-2)" },
      labelBgStyle: { fill: "var(--paper)" },
      style: { stroke: ORIGIN_COLOR[e.origin], strokeWidth: e.origin === "user" ? 2 : 1.2, strokeDasharray: e.relation === "contrast" || e.relation === "antonym" ? "4 3" : undefined },
      markerEnd: e.origin === "structure" ? undefined : { type: MarkerType.ArrowClosed, width: 12, height: 12, color: ORIGIN_COLOR[e.origin] },
      data: { note: e.note, linkId: e.linkId, origin: e.origin },
    })));
  }, [map, collapsed, levelFilter, posFilter, relFilter, study, revealed, setNodes, setEdges]);

  const onNodeClick = (_: unknown, node: Node) => {
    const n = map?.nodes.find((x) => x.id === node.id);
    if (!n) return;
    if (n.kind === "topic" || n.kind === "subtopic") {
      setCollapsed((c) => {
        const s = new Set(c);
        if (s.has(n.id)) s.delete(n.id);
        else s.add(n.id);
        return s;
      });
      return;
    }
    if (study && n.kind === "word" && !revealed.has(n.id)) {
      setRevealed((r) => new Set(r).add(n.id));
      return;
    }
    setSelected(n);
  };

  const suggest = async () => {
    setBusy(true);
    try {
      const r = await api<{ added: number; demo: boolean }>("/api/mindmap/suggest", { method: "POST", json: { topicId } });
      toast({ tone: r.demo ? "warn" : "sage", text: r.demo ? "Demo mode: no AI suggestions. Relations from your word data are shown." : `${r.added} AI connections added (your own links were kept).` });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (!selected?.entryId || !linkForm.to.trim()) return;
    const target = map?.nodes.find((n) => n.kind === "word" && n.label.toLowerCase() === linkForm.to.trim().toLowerCase());
    try {
      await api("/api/mindmap/links", { method: "POST", json: { fromEntryId: selected.entryId, toEntryId: target?.entryId ?? null, toLabel: target ? null : linkForm.to.trim(), relation: linkForm.relation, note: linkForm.note || null } });
      setLinkForm({ to: "", relation: "related", note: "" });
      toast({ tone: "sage", text: "Connection added" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  const removeLink = async (linkId: string) => {
    await api(`/api/mindmap/links/${linkId}`, { method: "DELETE" }).catch(() => {});
    await load();
  };

  const exportSvg = () => {
    if (!map) return;
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const minX = Math.min(...xs) - 120;
    const minY = Math.min(...ys) - 60;
    const w = Math.max(...xs) - minX + 240;
    const h = Math.max(...ys) - minY + 120;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const label = (id: string) => map.nodes.find((x) => x.id === id)?.label ?? "";
    const lines = edges.map((e) => {
      const a = byId.get(e.source)!.position;
      const b = byId.get(e.target)!.position;
      return `<line x1="${a.x - minX + 60}" y1="${a.y - minY + 20}" x2="${b.x - minX + 60}" y2="${b.y - minY + 20}" stroke="#999" stroke-width="1"/>` +
        (e.label ? `<text x="${(a.x + b.x) / 2 - minX + 60}" y="${(a.y + b.y) / 2 - minY + 16}" font-size="10" fill="#666" text-anchor="middle">${esc(String(e.label))}</text>` : "");
    }).join("");
    const boxes = nodes.map((n) => `<g><rect x="${n.position.x - minX}" y="${n.position.y - minY}" rx="10" width="120" height="40" fill="#fff" stroke="#223a5e"/><text x="${n.position.x - minX + 60}" y="${n.position.y - minY + 25}" font-size="12" text-anchor="middle" font-family="Georgia">${esc(label(n.id))}</text></g>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f7f5f0"/>${lines}${boxes}</svg>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `${map.topic.name.replace(/\W+/g, "-")}-mindmap.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const exportJson = () => {
    if (!map) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ topic: map.topic.name, nodes: map.nodes.map(({ id, kind, label, meaning }) => ({ id, kind, label, meaning })), edges: map.edges.map(({ source, target, relation, note, origin }) => ({ source, target, relation, note, origin })) }, null, 2)], { type: "application/json" }));
    a.download = `${map.topic.name.replace(/\W+/g, "-")}-mindmap.json`;
    a.click();
  };

  const posOptions = useMemo(() => [...new Set((map?.nodes ?? []).map((n) => n.partOfSpeech).filter(Boolean) as string[])], [map]);

  return (
    <>
      <PageHeader title="Mind Maps" subtitle="See how your words relate. Every connection is labelled: synonyms, contrasts, word families, collocations and your own links."
        actions={topicId ? <>
          <Button onClick={() => { setStudy((s) => !s); setRevealed(new Set()); }}>{study ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {study ? "Exit study mode" : "Study mode"}</Button>
          <Button onClick={suggest} loading={busy}><Sparkles className="size-4" aria-hidden /> Suggest connections</Button>
          <Button onClick={exportSvg}><Download className="size-4" aria-hidden /> SVG</Button>
          <Button onClick={exportJson}>JSON</Button>
        </> : undefined} />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px] md:items-end">
        <Field label="Topic" htmlFor="mm-topic"><TopicSelect id="mm-topic" topics={topics ?? []} value={topicId} onChange={(v) => router.replace(v ? `/mind-maps?topic=${v}` : "/mind-maps")} placeholder="Choose a topic…" /></Field>
        <Field label="Mastery" htmlFor="mm-level">
          <Select id="mm-level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">All levels</option>{Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Part of speech" htmlFor="mm-pos">
          <Select id="mm-pos" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
            <option value="">All</option>{posOptions.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
      </div>
      {topicId && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Relation types">
          {RELATIONS.map((r) => (
            <button key={r} type="button" aria-pressed={relFilter.has(r)} onClick={() => setRelFilter((s) => {
              const n = new Set(s);
              if (n.has(r)) n.delete(r);
              else n.add(r);
              return n;
            })} className={`rounded-full border px-2.5 py-0.5 text-xs ${relFilter.has(r) ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-3"}`}>{r.replace("_", " ")}</button>
          ))}
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {!topicId && topics && (topics.length ? <EmptyState title="Choose a topic">Each topic becomes a map; subtopics form branches you can collapse.</EmptyState> : <EmptyState title="No topics yet" action={<LinkButton href="/vocabulary/import" variant="primary">Import words</LinkButton>}>Maps are built from your topics.</EmptyState>)}
      {topicId && map?.topic.id !== topicId && !error && <Spinner />}
      {topicId && map && map.topic.id === topicId && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="h-[65vh] min-h-[420px] overflow-hidden rounded-xl border border-line bg-surface" aria-label={`Mind map of ${map.topic.name}`}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.05, minZoom: 0.6 }} minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}>
              <Background color="var(--line)" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <aside className="space-y-3">
            {study && <Notice tone="accent">Study mode: words show their meaning. Recall the word, then tap to check. ({revealed.size} revealed)</Notice>}
            {selected ? (
              <Card>
                <p className="text-xs uppercase text-ink-3">{selected.kind === "word" ? LEVEL_LABEL[(selected.level ?? "new") as MasteryLevel] : "Related expression"}</p>
                <h2 className="font-display text-2xl">{selected.label}</h2>
                {selected.meaning && <p className="text-ink-2">{selected.meaning}</p>}
                <ul className="mt-3 space-y-1.5 text-sm">
                  {map.edges.filter((e) => (e.source === selected.id || e.target === selected.id) && e.origin !== "structure").map((e) => (
                    <li key={e.id} className="flex items-start gap-2">
                      <Badge tone={e.origin === "user" ? "navy" : e.origin === "ai" ? "accent" : "neutral"}>{e.relation.replace("_", " ")}</Badge>
                      <span className="flex-1">{map.nodes.find((n) => n.id === (e.source === selected.id ? e.target : e.source))?.label}{e.note ? <span className="block text-xs text-ink-3">{e.note}</span> : null}</span>
                      {e.linkId && e.origin === "user" && <button type="button" aria-label="Remove connection" onClick={() => removeLink(e.linkId!)} className="text-ink-3 hover:text-danger"><Trash2 className="size-4" /></button>}
                    </li>
                  ))}
                </ul>
                {selected.entryId && (
                  <>
                    <div className="mt-3 flex gap-2"><LinkButton size="sm" href={`/vocabulary/${selected.entryId}`}>Open card</LinkButton><LinkButton size="sm" href={`/learn/session?mode=practice&ids=${selected.entryId}`}>Practise</LinkButton></div>
                    {selected.kind === "word" && (
                      <form className="mt-4 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); void addLink(); }}>
                        <p className="text-sm font-medium">Add your own connection</p>
                        <Input aria-label="Connected word or idea" list="mm-words" value={linkForm.to} onChange={(e) => setLinkForm((f) => ({ ...f, to: e.target.value }))} placeholder="Word or idea" />
                        <datalist id="mm-words">{map.nodes.filter((n) => n.kind === "word").map((n) => <option key={n.id} value={n.label} />)}</datalist>
                        <Select aria-label="Relation" value={linkForm.relation} onChange={(e) => setLinkForm((f) => ({ ...f, relation: e.target.value }))}>{RELATIONS.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</Select>
                        <Input aria-label="Note" value={linkForm.note} onChange={(e) => setLinkForm((f) => ({ ...f, note: e.target.value }))} placeholder="Why are they connected? (optional)" />
                        <Button size="sm" type="submit" variant="primary"><Plus className="size-4" aria-hidden /> Add</Button>
                      </form>
                    )}
                  </>
                )}
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-ink-2">Tap a word for details. Tap a topic to collapse or expand its branch. Drag to rearrange, pinch or scroll to zoom.</p>
                <ul className="mt-3 space-y-1 text-xs text-ink-3">
                  <li><span className="mr-1 inline-block size-2 rounded-full bg-sage" /> used actively / mastered</li>
                  <li><span className="mr-1 inline-block size-2 rounded-full bg-navy" /> recalled</li>
                  <li><span className="mr-1 inline-block size-2 rounded-full bg-warn" /> learning</li>
                  <li>Blue lines: your links · orange: AI suggestions · grey: from word data</li>
                </ul>
                <p className="mt-3 text-xs text-ink-3"><Link className="underline" href={`/writing/new?section=vocab_context&topic=${topicId}`}>Write a paragraph</Link> with this topic&apos;s words.</p>
              </Card>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

export function MindMapView() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
