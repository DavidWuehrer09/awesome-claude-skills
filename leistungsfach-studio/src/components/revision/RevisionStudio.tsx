"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExplanationOutput, RevisionCategory } from "@/lib/ai/schemas";
import { CATEGORY_INFO, type DocItem, type EditState, type RevisionDocument } from "@/lib/text/revisionDoc";
import type { DiffOp } from "@/lib/text/diff";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle, cx, ErrorNotice, Field, LoadingNotice, Notice, Textarea } from "@/components/ui";

type View = "changes" | "side" | "final" | "original";
type Explanation = { id: string; editId: string; question: string; result: ExplanationOutput; createdAt: string };

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Colour legend">
      <li className="flex items-center gap-1.5"><span className="diff-mark diff-retained">kept</span><span className="text-muted">retained wording</span></li>
      <li className="flex items-center gap-1.5"><span className="diff-mark diff-modified">changed</span><span className="text-muted">modified wording</span></li>
      <li className="flex items-center gap-1.5"><span className="diff-mark diff-added">added</span><span className="text-muted">new wording</span></li>
      <li className="flex items-center gap-1.5"><span className="diff-mark diff-removed">removed</span><span className="text-muted">deleted wording</span></li>
    </ul>
  );
}

function Ops({ ops, side }: { ops: DiffOp[]; side: "both" | "original" | "revised" }) {
  return (
    <>
      {ops.map((op, i) => {
        const sp = i > 0 ? " " : "";
        if (op.type === "retained") return <span key={i}>{sp}<span className="diff-mark diff-retained">{op.text}</span></span>;
        if (op.type === "added") return side === "original" ? null : <span key={i}>{sp}<ins className="diff-mark diff-added"><span className="sr-only">[added: </span>{op.text}<span className="sr-only">]</span></ins></span>;
        if (op.type === "removed") return side === "revised" ? null : <span key={i}>{sp}<del className="diff-mark diff-removed"><span className="sr-only">[removed: </span>{op.text}<span className="sr-only">]</span></del></span>;
        if (side === "original") return <span key={i}>{sp}<del className="diff-mark diff-modified"><span className="sr-only">[changed: </span>{op.from}<span className="sr-only">]</span></del></span>;
        return (
          <span key={i}>{sp}<mark className="diff-mark diff-modified" title={`was: ${op.from}`}><span className="sr-only">[changed from “{op.from}” to: </span>{op.to}<span className="sr-only">]</span></mark></span>
        );
      })}
    </>
  );
}

function stateBadge(s: EditState) {
  if (s === "accepted") return <Badge tone="good">accepted</Badge>;
  if (s === "rejected") return <Badge tone="neutral">kept original</Badge>;
  return null;
}

export function RevisionStudio({ revisionId, initialDoc, overview, initialExplanations }: { revisionId: string; initialDoc: RevisionDocument; overview: string; initialExplanations: Explanation[] }) {
  const [doc, setDoc] = useState(initialDoc);
  const [view, setView] = useState<View>("changes");
  const [selected, setSelected] = useState<string | null>(initialDoc.editOrder[0] ?? null);
  const [filter, setFilter] = useState<RevisionCategory | "all">("all");
  const [explanations, setExplanations] = useState(initialExplanations);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<null | "state" | "explain">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const items = useMemo(() => doc.paragraphs.flatMap((p) => p.items).filter((i): i is Extract<DocItem, { kind: "edit" }> => i.kind === "edit"), [doc]);
  const visibleIds = useMemo(() => items.filter((i) => filter === "all" || i.edit.category === filter).map((i) => i.edit.id), [items, filter]);
  const current = items.find((i) => i.edit.id === selected) ?? null;

  const move = useCallback((dir: 1 | -1) => {
    if (!visibleIds.length) return;
    const idx = selected ? visibleIds.indexOf(selected) : -1;
    const next = visibleIds[(idx + dir + visibleIds.length) % visibleIds.length];
    setSelected(next);
    document.getElementById(`edit-${next}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [visibleIds, selected]);

  const setState = useCallback(async (editId: string, state: EditState) => {
    setBusy("state"); setError(null);
    try {
      const v = await api<{ doc: RevisionDocument }>(`/api/revisions/${revisionId}/edits/${editId}`, { method: "PATCH", body: { state } });
      setDoc(v.doc);
    } catch (err) { setError(errorMessage(err)); }
    setBusy(null);
  }, [revisionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
      if (e.key === "k" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      if (e.key === "a" && selected) setState(selected, "accepted");
      if (e.key === "r" && selected) setState(selected, "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, selected, setState]);

  const explain = async () => {
    if (!current) return;
    setBusy("explain"); setError(null);
    try {
      const row = await api<Explanation>(`/api/revisions/${revisionId}/edits/${current.edit.id}/explain`, { body: { question } });
      setExplanations((x) => [row, ...x]); setQuestion("");
    } catch (err) { setError(errorMessage(err)); }
    setBusy(null);
  };

  const categories = Object.keys(doc.byCategory) as RevisionCategory[];
  const editBlock = (it: Extract<DocItem, { kind: "edit" }>, side: "both" | "original" | "revised") => {
    const dimmed = filter !== "all" && it.edit.category !== filter;
    const isSel = it.edit.id === selected;
    const content = it.state === "rejected" && side !== "original"
      ? <span className="diff-mark diff-retained">{it.original}</span>
      : it.edit.revised_text === "" && side !== "original" ? <del className="diff-mark diff-removed">{it.original}</del> : <Ops ops={it.ops} side={side} />;
    return (
      <span
        key={`${side}-${it.edit.id}`}
        id={side === "revised" || side === "both" ? `edit-${it.edit.id}` : undefined}
        role="button"
        tabIndex={0}
        aria-pressed={isSel}
        aria-label={`Change: ${CATEGORY_INFO[it.edit.category].label}${it.state !== "pending" ? `, ${it.state}` : ""}`}
        onClick={() => setSelected(it.edit.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(it.edit.id); } }}
        className={cx("cursor-pointer rounded-md px-0.5 transition-shadow", isSel && "ring-2 ring-accent ring-offset-2 ring-offset-surface", dimmed && "opacity-40")}
      >
        {content}
        <sup className="ml-0.5 font-sans text-[0.65rem] font-semibold text-muted">
          {CATEGORY_INFO[it.edit.category].short}{it.state === "rejected" ? " · original kept" : it.state === "accepted" ? " · accepted" : ""}{it.edit.is_new_idea ? " · new idea" : ""}
        </sup>
      </span>
    );
  };

  const renderDoc = (side: "both" | "original" | "revised") => (
    <div className="prose-essay text-ink">
      {doc.paragraphs.map((p) => (
        <p key={p.paragraph}>
          {p.items.map((it, i) => (
            <span key={i}>{i > 0 && " "}{it.kind === "unchanged" ? <span>{it.sentence.text}</span> : editBlock(it, side)}</span>
          ))}
        </p>
      ))}
    </div>
  );

  const myExplanations = explanations.filter((e) => e.editId === selected);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <Card>
          <p className="leading-relaxed text-ink-2">{overview}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span>{items.length} changes</span>·<span>{doc.stats.retained} words kept</span>·<span>{doc.stats.modified} changed</span>·<span>{doc.stats.added} added</span>·<span>{doc.stats.removed} removed</span>
          </div>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-line bg-surface p-1">
            {([["changes", "Changes"], ["side", "Side by side"], ["final", "Final version"], ["original", "Original"]] as [View, string][]).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx("rounded-md px-3 py-1.5 text-sm", view === v ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>{l}</button>
            ))}
          </div>
          {(view === "changes" || view === "side") && <Legend />}
        </div>
        {(view === "changes" || view === "side") && categories.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter changes by category">
            <button onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={cx("rounded-full border px-3 py-1 text-xs", filter === "all" ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2")}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setFilter(c)} aria-pressed={filter === c} className={cx("rounded-full border px-3 py-1 text-xs", filter === c ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2")}>{CATEGORY_INFO[c].label} ({doc.byCategory[c]})</button>
            ))}
          </div>
        )}

        {view === "changes" && <Card>{renderDoc("both")}</Card>}
        {view === "side" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardTitle>Your original</CardTitle>{renderDoc("original")}</Card>
            <Card><CardTitle>Improved version</CardTitle>{renderDoc("revised")}</Card>
          </div>
        )}
        {view === "final" && (
          <Card>
            <CardTitle aside={<Button size="sm" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(doc.finalText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>{copied ? "Copied" : "Copy text"}</Button>}>Final version</CardTitle>
            <p className="mb-3 text-xs text-muted">Changes you marked “keep original” are excluded. Reading this version is not the same as being able to write it — try rewriting a paragraph yourself in the Examiner.</p>
            <div className="prose-essay text-ink">{doc.finalText.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
          </Card>
        )}
        {view === "original" && <Card><div className="prose-essay text-ink">{doc.originalText.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div></Card>}
        <p className="text-xs text-muted">Keyboard: <kbd>←</kbd>/<kbd>→</kbd> or <kbd>j</kbd>/<kbd>k</kbd> move between changes · <kbd>a</kbd> accept · <kbd>r</kbd> keep original.</p>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start" aria-live="polite">
        <Card>
          {!current ? <p className="text-sm text-muted">Select a change to inspect it.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="accent">{CATEGORY_INFO[current.edit.category].label}</Badge>
                <span className="flex items-center gap-2 text-xs text-muted">{stateBadge(current.state)} {visibleIds.indexOf(current.edit.id) + 1}/{visibleIds.length}</span>
              </div>
              {current.edit.is_new_idea && (
                <Notice tone="warn"><strong>New idea — not in your original.</strong> It needs justification: {current.edit.needs_evidence_note ?? "check the source text."}</Notice>
              )}
              <div className="space-y-2 text-sm">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Before</p><p className="font-serif text-ink-2">{current.original}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">After</p><p className="font-serif text-ink">{current.edit.revised_text || <em>(removed)</em>}</p></div>
              </div>
              <div className="space-y-2 text-sm leading-relaxed text-ink-2">
                <p><span className="font-semibold text-ink">Why: </span>{current.edit.explanation}</p>
                <p><span className="font-semibold text-ink">Principle: </span>{current.edit.principle}</p>
                <p><span className="font-semibold text-ink">Do it yourself: </span>{current.edit.how_to_apply}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={current.state === "accepted" ? "primary" : "secondary"} onClick={() => setState(current.edit.id, "accepted")} disabled={busy !== null}>Accept</Button>
                <Button size="sm" variant={current.state === "rejected" ? "primary" : "secondary"} onClick={() => setState(current.edit.id, "rejected")} disabled={busy !== null}>Keep my original</Button>
                {current.state !== "pending" && <Button size="sm" variant="ghost" onClick={() => setState(current.edit.id, "pending")} disabled={busy !== null}>Undecided</Button>}
                <Button size="sm" variant="ghost" onClick={() => move(-1)}>← Prev</Button>
                <Button size="sm" variant="ghost" onClick={() => move(1)}>Next →</Button>
              </div>
              <div className="border-t border-line pt-4">
                <Field label="Understand it deeper" htmlFor="question" hint="Ask a question, or leave empty for a full explanation with new examples and a short practice.">
                  <Textarea id="question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why is “discuss about” wrong?" />
                </Field>
                <Button className="mt-2" size="sm" onClick={explain} loading={busy === "explain"}>Explain this change</Button>
              </div>
              {busy === "explain" && <LoadingNotice title="Preparing an explanation…" />}
              {error && <ErrorNotice message={error} />}
              {myExplanations.map((e) => (
                <div key={e.id} className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
                  {e.question && <p className="text-xs text-muted">You asked: {e.question}</p>}
                  <p>{e.result.explanation}</p>
                  <p><span className="font-semibold text-ink">Principle: </span>{e.result.principle}</p>
                  <ul className="space-y-1">{e.result.examples.map((x, i) => <li key={i}><span className="diff-mark diff-removed">{x.before}</span> → <span className="diff-mark diff-added">{x.after}</span> <span className="text-xs text-muted">{x.note}</span></li>)}</ul>
                  {e.result.common_mistakes.length > 0 && <p><span className="font-semibold text-ink">Watch out: </span>{e.result.common_mistakes.join(" · ")}</p>}
                  <div><p className="font-semibold text-ink">Try it: {e.result.practice.instruction}</p><ol className="list-decimal pl-5">{e.result.practice.items.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
                  <p className="italic">Self-check: {e.result.self_check}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}
