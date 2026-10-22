"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { REVISION_DEPTHS, type RevisionDepth } from "@/lib/ai/depths";
import { api, errorMessage } from "@/lib/client/api";
import { Button, Card, CardTitle, ErrorNotice, Field, LoadingNotice, Select } from "@/components/ui";

const LABEL: Record<RevisionDepth, string> = { corrections: "Corrections only", targeted: "Targeted (recommended)", exemplary: "Exemplary (13–15 model)" };

export function StartRevision({ essays }: { essays: { id: string; title: string; assessed: boolean }[] }) {
  const router = useRouter();
  const [essayId, setEssayId] = useState(essays[0]?.id ?? "");
  const [depth, setDepth] = useState<RevisionDepth>("targeted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!essays.length) return <Card><CardTitle>Start a revision</CardTitle><p className="text-sm text-muted">Submit an essay in the Essay Examiner first.</p></Card>;
  return (
    <Card>
      <CardTitle>Start a revision</CardTitle>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { const r = await api<{ id: string }>(`/api/essays/${essayId}/revisions`, { body: { depth } }); router.push(`/revision/${r.id}`); }
        catch (err) { setError(errorMessage(err)); setBusy(false); }
      }}>
        <Field label="Essay" htmlFor="rev-essay">
          <Select id="rev-essay" value={essayId} onChange={(e) => setEssayId(e.target.value)}>
            {essays.map((e) => <option key={e.id} value={e.id}>{e.title}{e.assessed ? "" : " (not assessed)"}</option>)}
          </Select>
        </Field>
        <Field label="Depth" htmlFor="rev-depth" hint="Targeted keeps your voice and focuses on your assessment priorities.">
          <Select id="rev-depth" value={depth} onChange={(e) => setDepth(e.target.value as RevisionDepth)}>
            {REVISION_DEPTHS.map((d) => <option key={d} value={d}>{LABEL[d]}</option>)}
          </Select>
        </Field>
        {busy && <LoadingNotice title="Preparing the revision…" detail="Usually 30–120 seconds." />}
        {error && <ErrorNotice message={error} />}
        <Button type="submit" loading={busy} className="w-full">Create revision</Button>
      </form>
    </Card>
  );
}
