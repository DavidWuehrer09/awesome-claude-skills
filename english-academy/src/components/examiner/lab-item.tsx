"use client";

import { useState } from "react";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import type { Assessment } from "@/domain/examiner/model";

type LabItem = Assessment["lab"][number];

/** One Improvement Lab item: the learner's passage at three levels, why it works, and a short exercise. */
export function LabItemCard({ item }: { item: LabItem }) {
  return (
    <Card>
      <p className="text-xs text-ink-3">Task {item.task} · your sentence</p>
      <p className="mt-1"><q className="rounded bg-surface-2 px-1">{item.original}</q></p>
      <ol className="mt-3 space-y-2 text-sm">
        <li><Badge>1 · correct</Badge> {item.level1Correct}</li>
        <li><Badge tone="navy">2 · stronger</Badge> {item.level2Stronger}</li>
        {item.level3HighLevel && <li><Badge tone="sage">3 · high level</Badge> {item.level3HighLevel}</li>}
      </ol>
      {item.explanation.improves.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{item.explanation.improves.map((x) => <Badge key={x} tone="accent">improves {x}</Badge>)}</div>}
      <div className="mt-3 space-y-1 text-sm text-ink-2">
        <p><span className="font-medium text-ink">Why it works:</span> {item.explanation.effective} {item.explanation.nuance}</p>
        <p><span className="font-medium text-ink">In this context:</span> {item.explanation.whyInContext}</p>
        {item.explanation.risks && <p><span className="font-medium text-ink">Watch out:</span> {item.explanation.risks}</p>}
      </div>
      <LabExercise ex={item.exercise} />
    </Card>
  );
}

function LabExercise({ ex }: { ex: LabItem["exercise"] }) {
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-line p-3 text-sm">
      <p className="font-medium">Try it: {ex.instruction}</p>
      {ex.material && <p className="mt-1 text-ink-2">{ex.material}</p>}
      <Textarea aria-label="Your attempt" rows={2} className="mt-2" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      {ex.answerKey && (shown ? <p className="mt-2 text-ink-2">Suggestion: {ex.answerKey}</p> : <Button size="sm" className="mt-2" disabled={!answer.trim()} onClick={() => setShown(true)}>Compare with a suggestion</Button>)}
    </div>
  );
}
