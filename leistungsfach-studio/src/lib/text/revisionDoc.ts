// Builds the Revision Studio view model from sentences + validated edits. Pure — unit-tested.
import type { RevisionCategory } from "@/lib/ai/schemas";
import { diffStats, diffWords, type DiffOp } from "./diff";
import type { Sentence } from "./segment";

export type StoredEdit = {
  id: string;
  target_ids: string[];
  revised_text: string;
  category: RevisionCategory;
  explanation: string;
  principle: string;
  how_to_apply: string;
  is_new_idea: boolean;
  needs_evidence_note: string | null;
};
export type EditState = "pending" | "accepted" | "rejected";

export type DocItem =
  | { kind: "unchanged"; sentence: Sentence }
  | { kind: "edit"; edit: StoredEdit; original: string; ops: DiffOp[]; state: EditState };

export type RevisionDocument = {
  paragraphs: { paragraph: number; items: DocItem[] }[];
  originalText: string;
  revisedText: string;
  finalText: string;
  stats: { retained: number; modified: number; added: number; removed: number };
  byCategory: Partial<Record<RevisionCategory, number>>;
  editOrder: string[];
};

export function buildRevisionDocument(sentences: Sentence[], edits: StoredEdit[], states: Record<string, EditState>): RevisionDocument {
  const editByFirstId = new Map<string, StoredEdit>();
  const covered = new Set<string>();
  for (const e of edits) {
    editByFirstId.set(e.target_ids[0], e);
    e.target_ids.forEach((id) => covered.add(id));
  }
  const paragraphs: RevisionDocument["paragraphs"] = [];
  const paraOf = (n: number) => {
    let p = paragraphs.find((x) => x.paragraph === n);
    if (!p) { p = { paragraph: n, items: [] }; paragraphs.push(p); }
    return p;
  };
  const stats = { retained: 0, modified: 0, added: 0, removed: 0 };
  const byCategory: RevisionDocument["byCategory"] = {};
  const originalParts: Map<number, string[]> = new Map();
  const revisedParts: Map<number, string[]> = new Map();
  const finalParts: Map<number, string[]> = new Map();
  const push = (m: Map<number, string[]>, p: number, s: string) => { if (!m.has(p)) m.set(p, []); if (s.trim()) m.get(p)!.push(s.trim()); };
  const editOrder: string[] = [];

  for (const s of sentences) {
    const p = paraOf(s.paragraph);
    push(originalParts, s.paragraph, s.text);
    if (!covered.has(s.id)) {
      p.items.push({ kind: "unchanged", sentence: s });
      stats.retained += s.text.split(/\s+/).filter(Boolean).length;
      push(revisedParts, s.paragraph, s.text);
      push(finalParts, s.paragraph, s.text);
      continue;
    }
    const e = editByFirstId.get(s.id);
    if (!e) continue; // later sentence of a multi-sentence edit
    const original = e.target_ids.map((id) => sentences.find((x) => x.id === id)?.text ?? "").join(" ");
    const ops = diffWords(original, e.revised_text);
    const st = diffStats(ops);
    stats.retained += st.retained; stats.modified += st.modified; stats.added += st.added; stats.removed += st.removed;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    const state = states[e.id] ?? "pending";
    p.items.push({ kind: "edit", edit: e, original, ops, state });
    editOrder.push(e.id);
    push(revisedParts, s.paragraph, e.revised_text);
    push(finalParts, s.paragraph, state === "rejected" ? original : e.revised_text);
  }
  const join = (m: Map<number, string[]>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.join(" ")).filter(Boolean).join("\n\n");
  return { paragraphs, originalText: join(originalParts), revisedText: join(revisedParts), finalText: join(finalParts), stats, byCategory, editOrder };
}

export const CATEGORY_INFO: Record<RevisionCategory, { label: string; short: string }> = {
  grammar: { label: "Grammar correction", short: "Grammar" },
  idiomatic: { label: "More idiomatic phrasing", short: "Idiom" },
  precision: { label: "Greater precision", short: "Precision" },
  structure_cohesion: { label: "Structure & cohesion", short: "Cohesion" },
  deeper_analysis: { label: "Deeper analysis", short: "Analysis" },
  argumentation: { label: "Stronger argumentation", short: "Argument" },
  evidence: { label: "Better use of evidence", short: "Evidence" },
  register_genre: { label: "Register / genre", short: "Register" },
};
