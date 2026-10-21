import { Info } from "lucide-react";
import Link from "next/link";
import { BarChart, Sparkline } from "@/components/charts";
import { Badge, Card, Meter, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { LEVEL_LABEL, type MasteryLevel } from "@/domain/learning/mastery";
import { DIMENSION_LABEL } from "@/domain/writing/rubrics";
import { requireUser } from "@/server/auth";
import { progressReport } from "@/server/repos/progress";
import { Trends } from "./trends";

export const metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

function Explain({ text }: { text: string }) {
  return <span title={text} className="inline-flex cursor-help text-ink-3" aria-label={text}><Info className="size-3.5" /></span>;
}

export default async function ProgressPage() {
  const user = await requireUser();
  const r = await progressReport(await getDb(), user.id);
  const o = r.observed;
  const levels = Object.entries(r.estimates.levels) as [MasteryLevel, number][];
  const totalLevels = Math.max(1, levels.reduce((a, [, n]) => a + n, 0));
  const dims = Object.keys(DIMENSION_LABEL).map((k) => ({ key: k, values: r.writingTrend.map((t) => t.dims[k]).filter((v): v is number => typeof v === "number") }));
  const estimates = r.writingTrend.filter((t) => t.estimate);

  return (
    <>
      <PageHeader title="Progress" subtitle="Observed data is shown as measured; estimates are labelled. Completed cards alone never count as mastery." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Words", o.totalWords, `${o.introduced} studied`, null],
          ["Independent recall", o.independentAccuracy28d === null ? "–" : `${o.independentAccuracy28d}%`, "typed, last 28 days", r.explanations.independentAccuracy28d],
          ["Estimated retention", r.estimates.retention === null ? "–" : `${r.estimates.retention}%`, "estimate (FSRS)", r.explanations.retention],
          ["Used in writing", o.writingTransferWords, "words used well in texts", r.explanations.writingTransferWords],
        ].map(([label, value, sub, explain]) => (
          <Card key={label as string}>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-ink-3">{label}{explain && <Explain text={explain as string} />}</p>
            <p className="mt-1 font-display text-3xl">{value}</p>
            <p className="text-sm text-ink-3">{sub}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg">Answers per day (28 days)</h2>
          <p className="text-sm text-ink-3">{o.attempts28d} answers · {o.accuracy28d ?? "–"}% correct overall <Explain text={r.explanations.accuracy28d} /> · {o.studyMinutes28d} min in sessions <Explain text={r.explanations.studyMinutes28d} /></p>
          <div className="mt-4">
            <BarChart label="Answers per day over the last 28 days" data={r.daily.map((d) => ({
              key: d.date, label: new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: d.reviews,
              detail: d.reviews ? `${Math.round((d.correct / d.reviews) * 100)}% correct` : undefined,
            }))} />
          </div>
        </Card>
        <Card>
          <h2 className="flex items-center gap-1 text-lg">Mastery levels <Explain text={r.explanations.levels} /></h2>
          <p className="text-sm text-ink-3">Estimate from separate skill measurements</p>
          <ul className="mt-4 space-y-3">
            {levels.map(([level, n]) => (
              <li key={level}>
                <div className="mb-1 flex justify-between text-sm"><span>{LEVEL_LABEL[level]}</span><span className="text-ink-3">{n}</span></div>
                <Meter value={(n / totalLevels) * 100} label={`${LEVEL_LABEL[level]}: ${n}`} />
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-2">Collocation accuracy</dt><dd>{o.collocationAccuracy28d ?? "–"}{o.collocationAccuracy28d !== null && "%"}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-1 text-ink-2">Weak active production <Explain text={r.explanations.weakProductionWords} /></dt><dd>{o.weakProductionWords}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Sentences written (28 d)</dt><dd>{o.productionAttempts28d}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="text-lg">By topic</h2>
        {r.byTopic.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-ink-3"><th className="py-2 font-normal">Topic</th><th className="font-normal">Words</th><th className="pr-6 font-normal">Mastery (est.)</th><th className="font-normal">Accuracy 28 d</th><th /></tr></thead>
              <tbody>
                {r.byTopic.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2">{t.name}</td>
                    <td>{t.words}</td>
                    <td className="w-48 pr-6"><div className="flex items-center gap-2"><Meter value={t.mastery} label={`${t.name} mastery`} /><span className="w-10 shrink-0 text-right tabular-nums text-ink-3">{t.mastery}%</span></div></td>
                    <td>{t.accuracy === null ? <span className="text-ink-3">–</span> : `${t.accuracy}% (${t.attempts})`}</td>
                    <td className="text-right"><Link className="text-navy underline" href={`/learn/session?mode=focused&topic=${t.id}`}>Practise</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-ink-3">No topics yet.</p>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg">Writing development</h2>
          <p className="text-sm text-ink-3">{r.writingTrend.length} AI-assessed text{r.writingTrend.length === 1 ? "" : "s"} · {o.submissions} submissions in total. Levels 1 (weak) to 5 (excellent).</p>
          <ul className="mt-3 divide-y divide-line">
            {dims.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{DIMENSION_LABEL[d.key]}</span>
                <Sparkline values={d.values} label={DIMENSION_LABEL[d.key]} />
              </li>
            ))}
          </ul>
          {estimates.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">Indicative estimates (practice rubric): {estimates.map((e) => `${e.estimate!.low}–${e.estimate!.high}`).join(" → ")} points</p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg">Recurring writing errors</h2>
          {r.patterns.length ? (
            <ul className="mt-3 space-y-3">
              {r.patterns.map((p) => (
                <li key={p.category} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.label}</span>
                    <span className="flex gap-1.5">
                      <Badge tone={p.cleanSubmissions >= 2 ? "sage" : p.submissionsAffected >= 3 ? "danger" : "warn"}>{p.submissionsAffected} affected · {p.cleanSubmissions} clean since</Badge>
                    </span>
                  </div>
                  <p className="text-ink-3">{p.practice}</p>
                  <p className="flex flex-wrap gap-3 text-xs">
                    <Link className="text-navy underline" href={`/writing/new?section=sentence&focus=${p.category}`}>Sentence Lab</Link>
                    <Link className="text-navy underline" href={p.drillHref}>Targeted drills</Link>
                  </p>
                  {p.nextRevisit && <p className="text-xs text-ink-3">Next revisit: {new Date(p.nextRevisit).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-3">Appears after AI-assessed writing.</p>}
        </Card>
      </div>
      <Trends />
    </>
  );
}
