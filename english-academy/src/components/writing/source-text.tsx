/** Source text with line numbers (non-blank lines), as in printed exams. */
export function SourceText({ text, label }: { text: string; label?: string | null }) {
  let n = 0;
  const lines = text.split("\n");
  return (
    <div>
      {label && <p className="mb-2 inline-block rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">{label}</p>}
      <div className="font-display text-[15px] leading-7">
        {lines.map((l, i) => {
          if (!l.trim()) return <div key={i} className="h-3" />;
          n++;
          return (
            <div key={i} className="grid grid-cols-[2.2rem_1fr] gap-2">
              <span className="select-none pt-0.5 text-right font-sans text-[11px] text-ink-3">{n % 5 === 0 || n === 1 ? n : ""}</span>
              <span>{l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
