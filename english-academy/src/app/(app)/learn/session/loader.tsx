"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionRunner } from "@/components/learn/session-runner";
import type { RunnerCard } from "@/components/learn/types";
import { Notice, Spinner } from "@/components/ui";
import type { Tolerance } from "@/domain/learning/answers";
import { DIMENSIONS } from "@/domain/learning/mastery";
import { api, ApiError, errorMessage } from "@/lib/api";
import { kvGet, kvSet } from "@/lib/offline";

type Built = { cards: RunnerCard[]; meta: Record<string, number> };

export function SessionLoader() {
  const p = useSearchParams();
  const [data, setData] = useState<Built | null>(null);
  const [tolerance, setTolerance] = useState<Tolerance>("normal");
  const [aiCheck, setAiCheck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const mode = (p.get("mode") ?? "mixed") as "review" | "focused" | "mixed" | "practice";
  const topic = p.get("topic");
  const timer = p.get("timer") ? Number(p.get("timer")) : undefined;
  const check = p.get("check") === "1";
  const adaptive = p.get("adaptive") === "1";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{ settings: { typoTolerance: Tolerance; aiEnabled: boolean }; ai: { available: boolean; demo: boolean } }>("/api/me").catch(() => null);
        if (me) {
          setTolerance(me.settings.typoTolerance);
          // The semantic answer check needs a real provider; demo mode never changes a verdict.
          setAiCheck(me.settings.aiEnabled && me.ai.available && !me.ai.demo);
        }
        let ids = p.get("ids")?.split(",").filter(Boolean);
        const list = p.get("list");
        if (list && !ids?.length) {
          const r = await api<{ items: { id: string }[] }>(`/api/vocab?list=${list}&limit=40${topic ? `&topic=${topic}` : ""}`);
          ids = r.items.map((i) => i.id);
        }
        if (check && topic && !ids?.length) {
          const r = await api<{ items: { id: string }[] }>(`/api/vocab?topic=${topic}&limit=25`);
          ids = r.items.map((i) => i.id);
        }
        const kinds = p.get("kinds")?.split(",").filter(Boolean);
        const body = {
          mode, topicId: topic || null, minutes: p.get("minutes") ? Number(p.get("minutes")) : undefined,
          entryIds: ids?.length ? ids : undefined, kinds: kinds?.length ? kinds : undefined, adaptive: adaptive || undefined,
        };
        let built: Built;
        if (check && ids?.length) {
          // Mastery check: each word is tested in several dimensions.
          const parts = await Promise.all(["meaning_choice", "typed_de_en", "collocation", "production"].map((k) =>
            api<Built>("/api/learn/session", { method: "POST", json: { ...body, kinds: [k], mode: "practice" } })));
          built = { cards: parts.flatMap((x) => x.cards), meta: {} };
        } else {
          built = await api<Built>("/api/learn/session", { method: "POST", json: body });
        }
        if (p.get("schedule") === "0") built.cards = built.cards.map((c) => ({ ...c, schedule: false }));
        if (!cancelled) setData(built);
        if (mode !== "practice") await kvSet("last-session", { at: Date.now(), built }).catch(() => {});
      } catch (e) {
        if (e instanceof ApiError && e.code === "offline") {
          const cached = await kvGet<{ at: number; built: Built }>("last-session").catch(() => undefined);
          if (cached && Date.now() - cached.at < 3 * 86400000) {
            if (!cancelled) {
              setOffline(true);
              setData(cached.built);
            }
            return;
          }
        }
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p, mode, topic, check, adaptive]);

  if (error) return <Notice tone="danger" title="Could not start the session">{error}</Notice>;
  if (!data) return <Spinner label="Preparing your session" />;
  return (
    <>
      {offline && <div className="mx-auto mb-4 max-w-2xl"><Notice tone="warn">You are offline. Continuing with your last downloaded session; answers are saved on this device and sync later.</Notice></div>}
      {data.meta?.deferred > 0 && <div className="mx-auto mb-4 max-w-2xl"><Notice>Today&apos;s review limit is reached; {data.meta.deferred} due words stay due and will come first next time (nothing is dropped).</Notice></div>}
      <SessionRunner
        cards={data.cards}
        title={check ? "Mastery check" : "Study session"}
        tolerance={tolerance}
        sessionMode={check ? "mastery_check" : timer ? "sprint" : mode}
        topicId={topic}
        timerSeconds={timer}
        summaryExtra={check ? (log) => <MasteryReport log={log} /> : undefined}
        aiAnswerCheck={aiCheck}
        adaptive={adaptive}
      />
    </>
  );
}

const SECURE = ["correct", "alternative", "typo"];

function MasteryReport({ log: all }: { log: { card: RunnerCard; outcome: string }[] }) {
  // Second chances after a miss are practice, not evidence of what was secure.
  const log = all.filter((l) => l.card.reason !== "retry");
  const byDim = new Map<string, { ok: number; n: number }>();
  const byWord = new Map<string, { headword: string; weak: Set<string>; n: number }>();
  for (const l of log) {
    const d = l.card.exercise.dimension;
    const ok = SECURE.includes(l.outcome);
    const v = byDim.get(d) ?? { ok: 0, n: 0 };
    v.n++;
    if (ok) v.ok++;
    byDim.set(d, v);
    const w = byWord.get(l.card.exercise.entryId) ?? { headword: l.card.exercise.reveal.headword, weak: new Set<string>(), n: 0 };
    w.n++;
    if (!ok) w.weak.add(d);
    byWord.set(l.card.exercise.entryId, w);
  }
  const label = (d: string) => DIMENSIONS.find((x) => x.key === d)?.label ?? d;
  const words = [...byWord.entries()].sort((a, b) => b[1].weak.size - a[1].weak.size || a[1].headword.localeCompare(b[1].headword));
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-ink-2">By skill</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {DIMENSIONS.filter((d) => byDim.has(d.key)).map((d) => {
          const v = byDim.get(d.key)!;
          const pct = Math.round((v.ok / v.n) * 100);
          return (
            <li key={d.key} className="flex justify-between">
              <span>{d.label}</span>
              <span className={pct >= 80 ? "text-sage" : pct >= 50 ? "text-warn" : "text-danger"}>{pct}% {pct >= 80 ? "secure" : "needs work"} ({v.ok}/{v.n})</span>
            </li>
          );
        })}
      </ul>
      <h3 className="mt-5 text-sm font-medium text-ink-2">Word by word</h3>
      <ul className="mt-2 divide-y divide-line text-sm">
        {words.map(([id, w]) => (
          <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
            <Link href={`/vocabulary/${id}`} className="font-display text-ink hover:underline">{w.headword}</Link>
            {w.weak.size ? (
              <span className="text-danger">weak: {[...w.weak].map(label).join(", ")}</span>
            ) : (
              <span className="text-sage">secure ({w.n} {w.n === 1 ? "test" : "tests"})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
