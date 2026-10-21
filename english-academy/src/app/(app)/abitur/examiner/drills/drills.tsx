"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Notice, PageHeader, Spinner, Textarea } from "@/components/ui";
import type { Drill } from "@/domain/examiner/drills";
import { skillLabel } from "@/domain/examiner/weaknesses";
import { api, errorMessage } from "@/lib/api";

const KIND_LABEL: Record<Drill["kind"], string> = { rewrite: "Rewrite", short_paragraph: "Short paragraph", identify: "Find the problem", plan: "Plan" };

export function Drills({ skill }: { skill: string | null }) {
  const [drills, setDrills] = useState<Drill[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchDrills = useCallback(() => api<{ drills: Drill[]; demo: boolean }>("/api/examiner/drills", { method: "POST", json: skill ? { skills: [skill] } : {} })
    .then((r) => { setDrills(r.drills); setDemo(r.demo); setError(null); })
    .catch((e) => setError(errorMessage(e))), [skill]);
  useEffect(() => void fetchDrills(), [fetchDrills]);
  const load = () => {
    setDrills(null);
    void fetchDrills();
  };

  return (
    <>
      <Link href="/abitur/examiner?tab=weaknesses" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> My Weaknesses</Link>
      <PageHeader title={skill ? `Practise: ${skillLabel(skill)}` : "Practice for your weaknesses"} subtitle="Short tasks aimed at what costs you marks. Try first, then compare and check yourself."
        actions={<Button onClick={load}><RefreshCw className="size-4" aria-hidden /> New drills</Button>} />
      {error && <Notice tone="danger">{error}</Notice>}
      {demo && <div className="mb-4"><Notice tone="warn">Built-in drills (no AI provider configured): the same tasks every time and not adapted to your vocabulary.</Notice></div>}
      {!drills && !error && <Spinner />}
      <div className="space-y-4">{drills?.map((d, i) => <DrillCard key={`${d.skill}-${i}`} drill={d} />)}</div>
    </>
  );
}

function DrillCard({ drill }: { drill: Drill }) {
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  return (
    <Card>
      <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{skillLabel(drill.skill)}</Badge><Badge>{KIND_LABEL[drill.kind]}</Badge></div>
      <p className="mt-2 font-medium">{drill.instruction}</p>
      {drill.material && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-display text-[15px] leading-7">{drill.material}</p>}
      <Textarea aria-label="Your answer" className="mt-3" rows={drill.kind === "short_paragraph" ? 6 : 3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      {!shown ? (
        <Button size="sm" className="mt-2" disabled={!answer.trim()} onClick={() => setShown(true)}>Compare and check</Button>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {drill.modelAnswer && <div><p className="font-medium">One good answer</p><p className="mt-1 text-ink-2">{drill.modelAnswer}</p></div>}
          <div>
            <p className="font-medium">Check your answer</p>
            <ul className="mt-1 space-y-1">
              {drill.checklist.map((c, i) => (
                <li key={i}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={checked.has(i)} onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} /> {c}</label></li>
              ))}
            </ul>
            {checked.size === drill.checklist.length && drill.checklist.length > 0 && <p className="mt-2 text-sage">All points covered. Well done.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
