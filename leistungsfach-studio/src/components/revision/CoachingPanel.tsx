"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Badge, Button, Card, CardTitle } from "@/components/ui";

export type Coaching = {
  phrase_upgrades: { original: string; upgraded: string; why: string; when_to_use: string }[];
  ideas_for_15: { idea: string; why_it_raises_the_mark: string; where: string; needs_evidence: string | null }[];
};

export function CoachingPanel({ coaching, revisionId }: { coaching: Coaching; revisionId: string }) {
  const [saved, setSaved] = useState<Record<number, string>>({});
  if (!coaching.ideas_for_15.length && !coaching.phrase_upgrades.length) return null;
  return (
    <div className="space-y-4">
      {coaching.ideas_for_15.length > 0 && (
        <Card className="border-accent/30">
          <CardTitle>Ideas to reach 15 — do these yourself</CardTitle>
          <p className="mb-3 text-sm text-muted">Ordered by impact on the mark. Try them in your next essay (or rewrite a paragraph of this one in the Examiner) — that is what moves your profile, not reading the model version.</p>
          <ol className="space-y-3">
            {coaching.ideas_for_15.map((i, n) => (
              <li key={n} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">{n + 1}</span>
                <div className="text-sm leading-relaxed">
                  <p className="font-medium text-ink">{i.idea}</p>
                  <p className="text-ink-2">{i.why_it_raises_the_mark}</p>
                  <p className="text-xs text-muted">Where: {i.where}{i.needs_evidence ? ` · Needs evidence: ${i.needs_evidence}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {coaching.phrase_upgrades.length > 0 && (
        <Card>
          <CardTitle>Phrase upgrades</CardTitle>
          <p className="mb-3 text-sm text-muted">Your wording → a more precise, sophisticated alternative. Save the ones you want to make your own; the vocabulary trainer then asks you to use them in new sentences.</p>
          <ul className="space-y-3">
            {coaching.phrase_upgrades.map((u, n) => (
              <li key={n} className="rounded-lg border border-line p-3 text-sm">
                <p className="leading-relaxed">
                  <del className="diff-mark diff-removed"><span className="sr-only">your phrase: </span>{u.original}</del>
                  <span aria-hidden> → </span>
                  <ins className="diff-mark diff-added"><span className="sr-only">upgrade: </span>{u.upgraded}</ins>
                </p>
                <p className="mt-1 text-ink-2">{u.why}</p>
                <p className="text-xs text-muted">When to use: {u.when_to_use}</p>
                <div className="mt-2">
                  {saved[n] ? <Badge tone={saved[n] === "Saved" ? "good" : "neutral"}>{saved[n]}</Badge> : (
                    <Button size="sm" variant="secondary" onClick={async () => {
                      try {
                        await api("/api/vocab", { body: { term: u.upgraded, meaning: u.why, example: "", pitfalls: `Instead of: ${u.original}. ${u.when_to_use}`, collocations: [], register: "formal", topic: "", sourceType: "revision", sourceId: revisionId } });
                        setSaved((s) => ({ ...s, [n]: "Saved" }));
                      } catch (err) { setSaved((s) => ({ ...s, [n]: errorMessage(err).includes("already") ? "Already in your bank" : "Could not save" })); }
                    }}>Save to vocabulary</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
