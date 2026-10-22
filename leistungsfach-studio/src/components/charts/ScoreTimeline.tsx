"use client";
import Link from "next/link";
import { useRef, useState } from "react";

export type TimelinePoint = { assessmentId: string; essayId: string; title: string; taskLabel: string; modeLabel: string; date: string; low: number; high: number; best: number; confidence: string; mock: boolean };

const W = 720, H = 260, PAD = { l: 34, r: 16, t: 14, b: 34 };
const y = (v: number) => PAD.t + (1 - v / 15) * (H - PAD.t - PAD.b);

/** Single-series range chart: each assessment's estimated range (band) and most likely score (dot). */
export function ScoreTimeline({ points }: { points: TimelinePoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const n = points.length;
  const x = (i: number) => (n === 1 ? (W + PAD.l - PAD.r) / 2 : PAD.l + 18 + (i * (W - PAD.l - PAD.r - 36)) / (n - 1));
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const a = active !== null ? points[active] : null;

  return (
    <figure className="m-0">
      <div ref={wrap} className="relative" onPointerLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Estimated scores of ${n} assessments over time; details in the table below.`}>
          {[0, 5, 10, 15].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(13)} y2={y(13)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={W - PAD.r} y={y(13) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">13+ band</text>
          {points.map((p, i) => (
            <g key={p.assessmentId}>
              <rect x={x(i) - 4} y={y(p.high)} width={8} height={Math.max(4, y(p.low) - y(p.high))} rx={4} fill="var(--series-1-band)" />
              <circle cx={x(i)} cy={y(p.best)} r={active === i ? 6 : 5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
              {i % labelEvery === 0 && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmt(p.date)}</text>}
              {/* hit target larger than the mark */}
              <rect
                x={x(i) - 14} y={PAD.t} width={28} height={H - PAD.t - PAD.b} fill="transparent"
                tabIndex={0} role="button" aria-label={`${p.title}: ${p.low} to ${p.high}, most likely ${p.best}`}
                onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                style={{ outline: "none" }}
              />
            </g>
          ))}
          {points.length >= 1 && (() => { const i = points.length - 1; const p = points[i]; return <text x={x(i) + 9} y={y(p.best) + 4} fontSize="12" fontWeight={600} fill="var(--ink)">{p.best}</text>; })()}
        </svg>
        {a && active !== null && (
          <div className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${(x(active) / W) * 100}% - 7rem), calc(100% - 14rem))`, top: 0 }}>
            <p className="text-base font-semibold tabular-nums text-ink">{a.low === a.high ? a.low : `${a.low}–${a.high}`} <span className="text-xs font-normal text-muted">most likely {a.best}</span></p>
            <p className="mt-1 font-medium text-ink">{a.title}</p>
            <p className="text-muted">{a.taskLabel} · {a.modeLabel} · {fmt(a.date)}</p>
            <p className="text-muted">Confidence: {a.confidence}{a.mock ? " · mock AI" : ""}</p>
          </div>
        )}
      </div>
      <figcaption className="mt-1 text-xs text-muted">Bars show each estimated range; dots the most likely score. Hover or tab through the points for details.</figcaption>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-1.5">Date</th><th>Essay</th><th>Task type</th><th>Mode</th><th>Range</th><th>Likely</th></tr></thead>
            <tbody>{points.map((p) => (
              <tr key={p.assessmentId} className="border-t border-line"><td className="py-1.5">{fmt(p.date)}</td><td><Link className="text-accent underline" href={`/essays/${p.essayId}?a=${p.assessmentId}`}>{p.title}</Link></td><td>{p.taskLabel}</td><td>{p.modeLabel}</td><td className="tabular-nums">{p.low}–{p.high}</td><td className="tabular-nums">{p.best}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
