"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MODE_INFO, MODES, type AssessmentMode } from "@/lib/curriculum";
import { REVISION_DEPTHS, type RevisionDepth } from "@/lib/ai/depths";
import { api, errorMessage } from "@/lib/client/api";
import { Button, Card, CardTitle, ErrorNotice, Field, Input, LoadingNotice, Select, Textarea } from "@/components/ui";

const DEPTH_LABEL: Record<RevisionDepth, string> = {
  corrections: "Corrections only — fix real errors",
  targeted: "Targeted — errors + top priorities",
  exemplary: "Exemplary — what 13–15 could look like",
};

export function EssayActions({ essayId, defaultMode }: { essayId: string; defaultMode: AssessmentMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AssessmentMode>(defaultMode);
  const [depth, setDepth] = useState<RevisionDepth>("targeted");
  const [busy, setBusy] = useState<null | "assess" | "revise" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "assess" | "revise") => {
    setBusy(kind); setError(null);
    try {
      if (kind === "assess") { await api(`/api/essays/${essayId}/assess`, { body: { mode } }); router.refresh(); }
      else { const rev = await api<{ id: string }>(`/api/essays/${essayId}/revisions`, { body: { depth } }); router.push(`/revision/${rev.id}`); return; }
    } catch (err) { setError(errorMessage(err)); router.refresh(); }
    setBusy(null);
  };

  return (
    <Card>
      <CardTitle>Next steps</CardTitle>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Assess (again) in mode" htmlFor="mode">
            <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as AssessmentMode)} className="w-48">
              {MODES.map((m) => <option key={m} value={m}>{MODE_INFO[m].label}</option>)}
            </Select>
          </Field>
          <Button onClick={() => run("assess")} loading={busy === "assess"} disabled={busy !== null}>Assess</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Revision depth" htmlFor="depth">
            <Select id="depth" value={depth} onChange={(e) => setDepth(e.target.value as RevisionDepth)} className="w-72">
              {REVISION_DEPTHS.map((d) => <option key={d} value={d}>{DEPTH_LABEL[d]}</option>)}
            </Select>
          </Field>
          <Button variant="secondary" onClick={() => run("revise")} loading={busy === "revise"} disabled={busy !== null}>Open in Revision Studio</Button>
        </div>
        {busy === "assess" && <LoadingNotice title="Assessing…" detail="Usually 30–120 seconds." />}
        {busy === "revise" && <LoadingNotice title="Preparing your revision…" detail="Usually 30–120 seconds." />}
        {error && <ErrorNotice message={error} />}
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
          <Link className="font-medium text-accent underline" href={`/examiner?parent=${essayId}`}>Write an improved version yourself</Link>
          <Link className="font-medium text-accent underline" href={`/training?from=${essayId}`}>Train on this essay&apos;s priorities</Link>
          <button className="text-bad underline" disabled={busy !== null} onClick={async () => {
            if (!confirm("Delete this essay, its assessments and revisions? Evidence derived from it is removed from your learner profile. This cannot be undone.")) return;
            setBusy("delete");
            try { await api(`/api/essays/${essayId}`, { method: "DELETE" }); router.push("/essays"); }
            catch (err) { setError(errorMessage(err)); setBusy(null); }
          }}>Delete essay</button>
        </div>
      </div>
    </Card>
  );
}

export function TeacherFeedbackForm({ essayId }: { essayId: string }) {
  const router = useRouter();
  const [score, setScore] = useState("");
  const [comments, setComments] = useState("");
  const [criteria, setCriteria] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card>
      <CardTitle>Add your teacher&apos;s feedback</CardTitle>
      <p className="mb-3 text-sm text-muted">Used to calibrate the teacher-standard mode. Kept separate from official requirements.</p>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        try {
          const fb = await api<{ id: string }>("/api/teacher-feedback", { body: { essayId, teacherScore: score === "" ? null : Number(score), comments, criteria } });
          if (comments.trim() || criteria.trim()) {
            try { await api(`/api/teacher-feedback/${fb.id}/analyse`, { body: {} }); }
            catch (err) { setMsg({ ok: false, text: `Saved. The analysis of the comments failed: ${errorMessage(err)} You can retry from your profile.` }); setBusy(false); router.refresh(); return; }
          }
          setMsg({ ok: true, text: "Saved." }); setScore(""); setComments(""); setCriteria(""); router.refresh();
        } catch (err) { setMsg({ ok: false, text: errorMessage(err) }); }
        setBusy(false);
      }}>
        <Field label="Teacher's score (0–15)" htmlFor="tscore" optional>
          <Input id="tscore" type="number" min={0} max={15} step={1} value={score} onChange={(e) => setScore(e.target.value)} className="w-28" />
        </Field>
        <Field label="Comments" htmlFor="tcomments" optional hint="Copy the teacher's written comments as exactly as you can.">
          <Textarea id="tcomments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>
        <Field label="Marking criteria" htmlFor="tcriteria" optional>
          <Textarea id="tcriteria" rows={2} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
        </Field>
        {msg && (msg.ok ? <p className="text-sm text-good">{msg.text}</p> : <ErrorNotice message={msg.text} />)}
        <Button type="submit" variant="secondary" loading={busy}>Save teacher feedback</Button>
      </form>
    </Card>
  );
}
