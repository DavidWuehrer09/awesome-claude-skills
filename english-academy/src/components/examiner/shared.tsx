"use client";

import { Badge } from "@/components/ui";
import { type Confidence, DOC_TYPE_LABEL, type DocType, type Provenance, PROVENANCE_LABEL } from "@/domain/examiner/model";

export type MaterialRow = {
  id: string; filename: string; mediaType: string; bytes: number; extractionMethod: string; extractionStatus: "needs_transcription" | "needs_review" | "reviewed";
  extractionNotes: string[]; docType: DocType | null; guess: DocType; guessConfidence: "high" | "medium" | "low";
  labels: { title?: string; topic: string[]; tags: string[]; date?: string; examType?: string; yearLevel?: string; importance?: "low" | "normal" | "high" | "essential" };
  createdAt: string; usable: boolean; chars: number; snippets: string[]; duplicateOf: string | null;
};

export type ProfileEntry = {
  id: string; section: string; statement: string; provenance: Provenance; confidence: Confidence;
  evidence: { materialId?: string; quote?: string; location?: string; url?: string }[]; userEdited: boolean; problems: string[];
};

export type Course = { yearLevel: string | null; courseLevel: string | null; preferredFormat: string | null; officialGuidance: { title: string; url: string; summary: string; verified: boolean; checked: string }[] };

export const STATUS_LABEL = { needs_transcription: "Needs transcription", needs_review: "Check the text", reviewed: "Reviewed" } as const;

export function DocTypeBadge({ m }: { m: Pick<MaterialRow, "docType" | "guess" | "guessConfidence"> }) {
  if (m.docType) return <Badge tone="navy">{DOC_TYPE_LABEL[m.docType]}</Badge>;
  return <Badge tone="warn" title="Not confirmed yet">Guess: {DOC_TYPE_LABEL[m.guess]} ({m.guessConfidence})</Badge>;
}

const PROV_TONE: Record<Provenance, "navy" | "sage" | "accent" | "neutral" | "warn"> = {
  teacher_explicit: "navy", observed_pattern: "accent", official_guidance: "sage", general_principle: "neutral", ai_suggestion: "warn",
};

export function ProvenanceBadge({ p, confidence }: { p: Provenance; confidence?: Confidence }) {
  return <Badge tone={PROV_TONE[p]} title={confidence ? `Confidence: ${confidence}` : undefined}>{PROVENANCE_LABEL[p]}{confidence ? ` · ${confidence}` : ""}</Badge>;
}

/** 0–15 track with the estimated range highlighted; the numbers are always printed next to it. */
export function PointsRange({ low, high, best }: { low: number; high: number; best?: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2.5 w-40 rounded-full bg-surface-2" role="img" aria-label={`Estimated ${low} to ${high} points out of 15`}>
        <div className="absolute inset-y-0 rounded-full bg-navy" style={{ left: `${(low / 15) * 100}%`, width: `${Math.max(2, ((high - low) / 15) * 100)}%` }} />
        {best != null && <div className="absolute -top-1 h-4.5 w-0.5 bg-accent" style={{ left: `${(best / 15) * 100}%` }} />}
      </div>
      <span className="text-sm tabular-nums text-ink">{low === high ? low : `${low}–${high}`} <span className="text-ink-3">/ 15</span>{best != null && <span className="text-ink-2"> · best guess {best}</span>}</span>
    </div>
  );
}

export const DIFFICULTY_LABEL = { consolidation: "Consolidation", realistic: "Realistic", stretch: "Stretch", abitur: "Abitur level" } as const;

export function formatBytes(n: number) {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}
