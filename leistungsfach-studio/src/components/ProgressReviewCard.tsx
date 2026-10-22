"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProgressReviewOutput } from "@/lib/ai/schemas";
import { api, errorMessage } from "@/lib/client/api";
import { Button, Card, CardTitle, ErrorNotice, formatDate, LoadingNotice, MockBadge, Notice } from "@/components/ui";

export function ProgressReviewCard({ latest }: { latest: { result: ProgressReviewOutput; createdAt: string; provider: string | null } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = latest?.result;
  return (
    <Card>
      <CardTitle aside={<Button size="sm" variant="secondary" loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await api("/api/progress-review", { body: {} }); router.refresh(); } catch (err) { setError(errorMessage(err)); }
        setBusy(false);
      }}>{latest ? "Update review" : "Write a progress review"}</Button>}>Tutor&apos;s progress review</CardTitle>
      {busy && <LoadingNotice title="Reviewing your statistics…" />}
      {error && <ErrorNotice message={error} />}
      {!r ? <p className="text-sm text-muted">The tutor reads your computed statistics (not your essays) and writes a short, cautious review. Figures it cannot find in your data are rejected.</p> : (
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p className="flex items-center gap-2 text-xs text-muted">{formatDate(latest!.createdAt)} <MockBadge provider={latest!.provider} /></p>
          <p className="text-ink">{r.summary}</p>
          {r.improvements.length > 0 && <div><p className="font-semibold text-good">Genuine improvements</p><ul className="list-disc pl-5">{r.improvements.map((i) => <li key={i.statement}>{i.statement} <span className="text-muted">({i.evidence})</span></li>)}</ul></div>}
          {r.concerns.length > 0 && <div><p className="font-semibold text-ink">Concerns</p><ul className="list-disc pl-5">{r.concerns.map((i) => <li key={i.statement}>{i.statement} <span className="text-muted">({i.evidence})</span></li>)}</ul></div>}
          {r.comparability_cautions.length > 0 && <Notice tone="warn"><ul className="list-disc pl-4">{r.comparability_cautions.map((c) => <li key={c}>{c}</li>)}</ul></Notice>}
          <div><p className="font-semibold text-ink">Next steps</p><ol className="list-decimal pl-5">{r.next_steps.map((s) => <li key={s}>{s}</li>)}</ol></div>
        </div>
      )}
    </Card>
  );
}
