"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Meter, Notice, PageHeader, Spinner, useToast } from "@/components/ui";
import { DIMENSION_LABEL } from "@/domain/writing/rubrics";
import { api, errorMessage } from "@/lib/api";

type Profile = {
  words: { total: number; introduced: number; recalled: number; productive: number; mastered: number };
  vocabulary: { key: string; label: string; score: number | null; evidence: number }[];
  writing: { key: string; score: number; evidence: number }[];
  writingAssessments: number; examsAssessed: number;
  patterns: { category: string; submissionsAffected: number; cleanSubmissions: number; lastSeen: string | null; examples: string[] }[];
};

export function LearnerProfile() {
  const toast = useToast();
  const [p, setP] = useState<Profile | null>(null);
  const load = useCallback(() => api<Profile>("/api/profile").then(setP), []);
  useEffect(() => void load(), [load]);
  const dismiss = async (category: string) => {
    if (!confirm(`Remove “${category}” from your recurring problems? It comes back if it appears again in your writing.`)) return;
    try {
      await api(`/api/profile/patterns/${encodeURIComponent(category)}`, { method: "DELETE" });
      toast({ tone: "sage", text: "Removed from your profile" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };
  if (!p) return <Spinner />;
  return (
    <>
      <Link href="/progress" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Progress</Link>
      <PageHeader title="Your learner profile" subtitle="What the app has learned about you, from your answers and assessed writing only. Nothing here is guessed. Correct it where it is wrong." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg">Vocabulary</h2>
          <p className="mt-1 text-sm text-ink-2">{p.words.total} words · {p.words.recalled} recalled · {p.words.productive} used actively · {p.words.mastered} mastered</p>
          <ul className="mt-3 space-y-3">
            {p.vocabulary.map((v) => (
              <li key={v.key}>
                {v.score === null ? <p className="text-sm text-ink-3">{v.label}: not tested yet</p> : <Meter value={v.score} label={`${v.label} (${v.evidence} word${v.evidence === 1 ? "" : "s"})`} />}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg">Writing</h2>
          {p.writing.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">No real writing assessment yet. Submit a text in the Writing Lab with an AI provider configured; demo checks are not counted.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {p.writing.map((w) => <li key={w.key}><Meter value={w.score} tone="sage" label={`${DIMENSION_LABEL[w.key] ?? w.key} (${w.evidence} text${w.evidence === 1 ? "" : "s"})`} /></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-3">Based on your last {p.writingAssessments} assessed text{p.writingAssessments === 1 ? "" : "s"}{p.examsAssessed ? ` and ${p.examsAssessed} assessed practice exam${p.examsAssessed === 1 ? "" : "s"} (see My Examiner → My Weaknesses)` : ""}.</p>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="text-lg">Recurring problems in your writing</h2>
          {p.patterns.length === 0 ? <p className="mt-2 text-sm text-ink-2">None recorded.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {p.patterns.map((x) => (
                <li key={x.category} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{x.category}</span> <Badge tone={x.submissionsAffected >= 2 ? "warn" : "neutral"}>in {x.submissionsAffected} text{x.submissionsAffected === 1 ? "" : "s"}</Badge>
                    {x.cleanSubmissions > 0 && <Badge tone="sage">{x.cleanSubmissions} clean since</Badge>}
                    {x.examples[0] && <span className="mt-0.5 block text-xs text-ink-3">e.g. “{x.examples[0]}”</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(x.category)}>Not a problem any more</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4"><Notice>The AI tutor uses this profile only if you allow it in Settings → AI. You can reset it there completely.</Notice></div>
    </>
  );
}
