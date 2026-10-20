"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart } from "@/components/charts";
import { Badge, Card, Meter, Notice, PageHeader, Select, Spinner, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Plan = { label: string; monthly: Record<string, number | null>; monthlyUsd: number | null };
type Report = {
  monthStart: string; budgets: { dailyUsd: number | null; monthlyUsd: number | null }; spend: { todayUsd: number; monthUsd: number };
  byFeature: { feature: string; category: string; requests: number; failed: number; inputTokens: number; outputTokens: number; usd: number; unpriced: number }[];
  byDay: { day: string; usd: number; requests: number }[];
  topUsers: { userId: string; email: string; plan: string; requests: number; usd: number }[];
  userCount: number; planCounts: { plan: string; n: number }[]; errors: { code: string | null; n: number }[]; plans: Record<string, Plan>;
};

const usd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`);

export function AdminUsage() {
  const toast = useToast();
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Report>("/api/admin/usage").then(setR).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => void load(), [load]);
  const setPlan = async (userId: string, plan: string) => {
    try {
      await api(`/api/admin/users/${userId}`, { method: "PATCH", json: { plan } });
      toast({ tone: "sage", text: "Plan changed" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!r) return <Spinner />;
  const unpriced = r.byFeature.reduce((n, f) => n + f.unpriced, 0);
  const totalRequests = r.byFeature.reduce((n, f) => n + f.requests, 0);
  return (
    <>
      <PageHeader title="Usage & costs" subtitle={`AI usage since ${new Date(r.monthStart).toLocaleDateString()} (UTC month). Costs are estimates from list prices; your provider's invoice is authoritative.`} />
      <div className="space-y-4">
        {r.budgets.dailyUsd === null && r.budgets.monthlyUsd === null && <Notice tone="warn" title="No spending limit set">Set AI_BUDGET_DAILY_USD and AI_BUDGET_MONTHLY_USD before opening the site to the public. Also set a spend limit in your AI provider&apos;s console as a second safety net.</Notice>}
        {unpriced > 0 && <Notice tone="warn">{unpriced} requests used a model without a known price, so they are missing from the totals and budgets. Set AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK.</Notice>}
        <div className="grid gap-4 md:grid-cols-3">
          <Card><p className="text-sm text-ink-3">Today</p><p className="text-3xl tabular-nums">{usd(r.spend.todayUsd)}</p>{r.budgets.dailyUsd !== null && <Meter value={r.spend.todayUsd / r.budgets.dailyUsd} label={`of ${usd(r.budgets.dailyUsd)} daily budget`} />}</Card>
          <Card><p className="text-sm text-ink-3">This month</p><p className="text-3xl tabular-nums">{usd(r.spend.monthUsd)}</p>{r.budgets.monthlyUsd !== null && <Meter value={r.spend.monthUsd / r.budgets.monthlyUsd} label={`of ${usd(r.budgets.monthlyUsd)} monthly budget`} />}</Card>
          <Card><p className="text-sm text-ink-3">Accounts</p><p className="text-3xl tabular-nums">{r.userCount}</p><p className="text-xs text-ink-3">{r.planCounts.map((p) => `${p.n} ${r.plans[p.plan]?.label ?? p.plan}`).join(" · ")}</p></Card>
        </div>
        <Card>
          <h2 className="text-lg">Estimated AI cost per day</h2>
          {r.byDay.length ? <BarChart label="Estimated AI cost per day (USD)" valueSuffix=" $" data={r.byDay.map((d) => ({ key: d.day, label: d.day.slice(5), value: Math.round(d.usd * 100) / 100, detail: `${d.requests} requests` }))} /> : <p className="mt-2 text-sm text-ink-2">No real AI requests this month.</p>}
        </Card>
        <Card>
          <h2 className="text-lg">By feature</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3"><th className="py-1.5 pr-3 font-medium">Feature</th><th className="pr-3 font-medium">Allowance category</th><th className="pr-3 text-right font-medium">Requests</th><th className="pr-3 text-right font-medium">Failed</th><th className="pr-3 text-right font-medium">Tokens in / out</th><th className="text-right font-medium">Est. cost</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.byFeature.map((f) => (
                  <tr key={f.feature}><td className="py-2 pr-3">{f.feature}</td><td className="pr-3 text-ink-2">{f.category}</td><td className="pr-3 text-right tabular-nums">{f.requests}</td><td className="pr-3 text-right tabular-nums">{f.failed}</td><td className="pr-3 text-right tabular-nums">{f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}</td><td className="text-right tabular-nums">{usd(f.usd)}{f.requests ? <span className="text-ink-3"> · {usd(f.usd / f.requests)}/req</span> : null}</td></tr>
                ))}
              </tbody>
            </table>
            {!totalRequests && <p className="mt-2 text-sm text-ink-2">Nothing yet. Demo-mode requests are free and not listed.</p>}
          </div>
          {r.errors.length > 0 && <p className="mt-2 text-xs text-ink-3">Errors: {r.errors.map((e) => `${e.code ?? "unknown"} × ${e.n}`).join(", ")}</p>}
        </Card>
        <Card>
          <h2 className="text-lg">Highest usage this month</h2>
          {r.topUsers.length === 0 ? <p className="mt-2 text-sm text-ink-2">No usage yet.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {r.topUsers.map((u) => (
                <li key={u.userId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{u.email}</span>
                  <span className="tabular-nums text-ink-2">{u.requests} req · {usd(u.usd)}</span>
                  <Select aria-label={`Plan for ${u.email}`} className="w-auto" value={u.plan} onChange={(e) => setPlan(u.userId, e.target.value)}>
                    {Object.entries(r.plans).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="text-lg">Plans</h2>
          <p className="mt-1 text-sm text-ink-2">Monthly allowances per account. Change them with the AI_PLANS environment variable; new accounts get DEFAULT_PLAN.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3"><th className="py-1.5 pr-3 font-medium">Plan</th>{Object.keys(Object.values(r.plans)[0]?.monthly ?? {}).map((c) => <th key={c} className="pr-3 text-right font-medium">{c.replace("_", " ")}</th>)}<th className="text-right font-medium">cost cap</th></tr></thead>
              <tbody className="divide-y divide-line">
                {Object.entries(r.plans).map(([id, p]) => (
                  <tr key={id}><td className="py-2 pr-3">{p.label} <Badge>{id}</Badge></td>{Object.values(p.monthly).map((v, i) => <td key={i} className="pr-3 text-right tabular-nums">{v ?? "∞"}</td>)}<td className="text-right tabular-nums">{p.monthlyUsd === null ? "∞" : usd(p.monthlyUsd)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
