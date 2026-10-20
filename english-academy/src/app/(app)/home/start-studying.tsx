"use client";

import { Play, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui";

export function StartStudying({ defaultMinutes, hasWork, empty }: { defaultMinutes: number; hasWork: boolean; empty: boolean }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(defaultMinutes);
  if (empty) return <LinkButton href="/vocabulary/import" variant="primary" size="lg">Import your first list</LinkButton>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" size="lg" onClick={() => router.push(`/learn/session?mode=mixed&minutes=${minutes}`)}>
        <Play className="size-4" aria-hidden /> {hasWork ? "Start studying" : "Extra practice"}
      </Button>
      <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Session length">
        <Timer className="ml-1 size-4 text-ink-3" aria-hidden />
        {[5, 10, defaultMinutes, 30].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((m) => (
          <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)}
            className={`rounded-md px-2.5 py-1 text-sm ${minutes === m ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2"}`}>
            {m} min
          </button>
        ))}
      </div>
    </div>
  );
}
