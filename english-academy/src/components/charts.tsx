"use client";

import { useState } from "react";

/**
 * Single-series SVG charts in the app's navy hue. Bars are anchored to the
 * baseline with 4px rounded data-ends, separated by a 2px surface gap, with a
 * hover/focus tooltip and a table view for accessibility.
 */
export function BarChart({ data, label, height = 160, valueSuffix = "" }: {
  data: { key: string; label: string; value: number; detail?: string }[]; label: string; height?: number; valueSuffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="w-full">
      <div className="mb-1 flex justify-end"><button type="button" className="text-xs text-ink-3 underline" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show table"}</button></div>
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead><tr className="text-left text-ink-3"><th className="font-normal">Day</th><th className="text-right font-normal">Value</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.key} className="border-t border-line"><td className="py-1">{d.label}</td><td className="py-1 text-right">{d.value}{valueSuffix}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="relative" style={{ height }}>
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={label}>
            {ticks.map((t) => {
              const y = height - (t / max) * (height - 4);
              return <line key={t} x1="0" x2="100" y1={y} y2={y} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
            })}
            {data.map((d, i) => {
              const h = (d.value / max) * (height - 4);
              const x = i * w + w * 0.12;
              const bw = w * 0.76;
              const r = Math.min(4, h / 2);
              return (
                <path key={d.key}
                  d={h > 0 ? `M${x},${height} V${height - h + r} Q${x},${height - h} ${x + Math.min(r, bw / 2)},${height - h} H${x + bw - Math.min(r, bw / 2)} Q${x + bw},${height - h} ${x + bw},${height - h + r} V${height} Z` : ""}
                  fill="var(--navy)" opacity={hover === null || hover === i ? 1 : 0.45} />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <button key={d.key} type="button" className="h-full flex-1 focus:outline-none" aria-label={`${d.label}: ${d.value}${valueSuffix}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </div>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-xs text-paper shadow"
              style={{ left: `${(hover + 0.5) * w}%` }}>
              <strong>{data[hover].value}{valueSuffix}</strong> · {data[hover].label}{data[hover].detail ? <><br />{data[hover].detail}</> : null}
            </div>
          )}
        </div>
      )}
      {!table && (
        <div className="mt-1 flex justify-between text-[10px] text-ink-3" aria-hidden>
          <span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data[data.length - 1]?.label}</span>
        </div>
      )}
    </figure>
  );
}

/** Small multiple: one dimension's level over time (1 = weak … 5 = excellent). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="text-xs text-ink-3">{values.length ? "1 assessment" : "no data"}</span>;
  const w = 120;
  const h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 8) + 4},${h - 4 - ((v - 1) / 4) * (h - 8)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={w} height={h} role="img" aria-label={`${label}: ${values.join(", ")} (1 weak – 5 excellent)`}>
      <line x1="4" x2={w - 4} y1={h - 4} y2={h - 4} stroke="var(--line)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--navy)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
