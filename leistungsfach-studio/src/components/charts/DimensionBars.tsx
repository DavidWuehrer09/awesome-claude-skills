// Horizontal magnitude bars (single series, direct-labelled, sorted weakest first), grouped by rubric column.
export type DimBar = { key: string; label: string; group: string; mean: number; n: number; first: number; latest: number };

function Group({ title, data }: { title: string; data: DimBar[] }) {
  if (!data.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="space-y-2.5" aria-label={`${title}: average score per criterion, weakest first`}>
        {data.map((d) => (
          <li key={d.key} className="grid grid-cols-[minmax(9rem,15rem)_1fr_2.5rem] items-center gap-3 text-sm"
            title={`${d.label}: average ${d.mean}/15 over ${d.n} essay${d.n === 1 ? "" : "s"} (first ${d.first}, latest ${d.latest})`}>
            <span className="text-ink-2">{d.label}</span>
            <span className="relative h-3 rounded bg-surface-2" aria-hidden>
              <span className="absolute left-0 top-0 h-3 rounded-r" style={{ width: `${(d.mean / 15) * 100}%`, background: "var(--series-1)" }} />
              <span className="absolute top-[-3px] h-[18px] w-px bg-[var(--muted)]" style={{ left: `${(13 / 15) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-ink">{d.mean}<span className="sr-only"> out of 15, {d.n} essays</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DimensionBars({ data }: { data: DimBar[] }) {
  return (
    <figure className="m-0 space-y-5">
      <Group title="Content & structure" data={data.filter((d) => d.group === "content")} />
      <Group title="Language" data={data.filter((d) => d.group === "language")} />
      <figcaption className="text-xs text-muted">Average of your latest assessment per essay (0–15). The thin line marks 13 points. Criteria only apply to the task types that use them, so counts differ — hover a row for its count.</figcaption>
    </figure>
  );
}
