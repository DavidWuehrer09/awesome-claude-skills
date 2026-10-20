"use client";

import { Bell, Download, Mail, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Dialog, Field, Input, Notice, PageHeader, Select, Spinner, Toggle, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type SettingsT = {
  timezone: string; targetLevel: string; mainGoal: string | null; examDate: string | null; sessionMinutes: number; dailyNewLimit: number; dailyReviewLimit: number;
  requestRetention: number; typoTolerance: string; reminderTime: string; reminderDays: number[]; quietStart: string; quietEnd: string; pushEnabled: boolean;
  pushPromptDeclined: boolean; emailEnabled: boolean; aiEnabled: boolean; aiProfileConsent: boolean; theme: string; reducedMotion: boolean; showStreak: boolean;
};
type Me = {
  user: { email: string; displayName: string | null };
  settings: SettingsT;
  ai: { provider: string; model: string | null; demo: boolean; available: boolean; misconfigured: boolean };
  push: { configured: boolean; publicKey: string | null };
  email: { configured: boolean };
  allowance: { plan: string; planLabel: string; resetsAt: string; categories: { category: string; label: string; used: number; limit: number | null }[] };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function Settings() {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [s, setS] = useState<SettingsT | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "ios-browser" | "default" | "granted" | "denied">("default");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [timezones, setTimezones] = useState<string[]>([]);

  const load = useCallback(() => api<Me>("/api/me").then((r) => {
    setMe(r);
    setS(r.settings);
  }), []);
  useEffect(() => {
    load().then(() => {
      try {
        setTimezones((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []);
      } catch { /* older browsers */ }
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) setPushState(ios && !standalone ? "ios-browser" : "unsupported");
      else setPushState(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default");
    }).catch((e) => toast({ tone: "danger", text: errorMessage(e) }));
  }, [load, toast]);

  const update = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setS((x) => (x ? { ...x, [k]: v } : x));

  const save = async (patch?: Partial<SettingsT>) => {
    if (!s) return;
    setSaving(true);
    try {
      const body = patch ?? s;
      await api("/api/settings", { method: "PATCH", json: body });
      if ("theme" in body) {
        try { localStorage.setItem("academy-theme", body.theme!); } catch { /* ignore */ }
        if (body.theme === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = body.theme!;
      }
      if ("reducedMotion" in body) {
        try { localStorage.setItem("academy-reduced-motion", String(body.reducedMotion)); } catch { /* ignore */ }
        document.documentElement.dataset.reducedMotion = String(body.reducedMotion);
      }
      toast({ tone: "sage", text: "Settings saved" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    if (!me?.push.publicKey) return;
    try {
      const permission = await Notification.requestPermission();
      setPushState(permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default");
      if (permission !== "granted") {
        await api("/api/settings", { method: "PATCH", json: { pushPromptDeclined: true } });
        toast({ tone: "warn", text: "Notifications were not allowed. We won't ask again; you can change this in your browser settings." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(me.push.publicKey) });
      await api("/api/push/subscribe", { method: "POST", json: sub.toJSON() });
      toast({ tone: "sage", text: "Push reminders enabled on this device" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  const disablePush = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await api("/api/push/subscribe", { method: "DELETE", json: { endpoint: sub?.endpoint } });
      await sub?.unsubscribe();
      toast({ tone: "neutral", text: "Push reminders turned off for this device" });
      await load();
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    }
  };

  if (!me || !s) return <Spinner />;

  return (
    <>
      <PageHeader title="Settings" subtitle={`Signed in as ${me.user.email}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg">Study</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Session length" htmlFor="sm"><Select id="sm" value={s.sessionMinutes} onChange={(e) => update("sessionMinutes", Number(e.target.value))}>{[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</Select></Field>
            <Field label="Target level" htmlFor="tl"><Select id="tl" value={s.targetLevel} onChange={(e) => update("targetLevel", e.target.value)}><option>B2</option><option>C1</option><option>C2</option></Select></Field>
            <Field label="New words per day" htmlFor="nl"><Input id="nl" type="number" min={0} max={100} value={s.dailyNewLimit} onChange={(e) => update("dailyNewLimit", Number(e.target.value))} /></Field>
            <Field label="Max reviews per day" htmlFor="rl" hint="Overdue words beyond this stay due; they are never discarded."><Input id="rl" type="number" min={10} max={1000} value={s.dailyReviewLimit} onChange={(e) => update("dailyReviewLimit", Number(e.target.value))} /></Field>
            <Field label="Target retention" htmlFor="rr" hint="Higher = more reviews, better recall (FSRS desired retention)."><Select id="rr" value={s.requestRetention} onChange={(e) => update("requestRetention", Number(e.target.value))}>{[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => <option key={r} value={r}>{Math.round(r * 100)}%</option>)}</Select></Field>
            <Field label="Spelling tolerance in typed answers" htmlFor="tt"><Select id="tt" value={s.typoTolerance} onChange={(e) => update("typoTolerance", e.target.value)}><option value="strict">Strict (exact spelling)</option><option value="normal">Normal (small slips = Hard)</option><option value="lenient">Lenient</option></Select></Field>
            <Field label="Exam date" htmlFor="ed"><Input id="ed" type="date" value={s.examDate ?? ""} onChange={(e) => update("examDate", e.target.value || null)} /></Field>
            <Field label="Time zone" htmlFor="tz">
              <Select id="tz" value={s.timezone} onChange={(e) => update("timezone", e.target.value)}>
                {(timezones.length ? timezones : [s.timezone]).map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Main goal" htmlFor="mg"><Input id="mg" value={s.mainGoal ?? ""} onChange={(e) => update("mainGoal", e.target.value)} /></Field>
          <Button variant="primary" onClick={() => save({ sessionMinutes: s.sessionMinutes, targetLevel: s.targetLevel, dailyNewLimit: s.dailyNewLimit, dailyReviewLimit: s.dailyReviewLimit, requestRetention: s.requestRetention, typoTolerance: s.typoTolerance, examDate: s.examDate, timezone: s.timezone, mainGoal: s.mainGoal })} loading={saving}>Save study settings</Button>
        </Card>

        <Card className="space-y-4" >
          <h2 id="reminders" className="text-lg">Reminders</h2>
          <p className="text-sm text-ink-2">The in-app review queue always works. Push and email are optional extras and are sent at most once a day.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Reminder time" htmlFor="rt"><Input id="rt" type="time" value={s.reminderTime} onChange={(e) => update("reminderTime", e.target.value)} /></Field>
            <Field label="Quiet from" htmlFor="qs"><Input id="qs" type="time" value={s.quietStart} onChange={(e) => update("quietStart", e.target.value)} /></Field>
            <Field label="Quiet until" htmlFor="qe"><Input id="qe" type="time" value={s.quietEnd} onChange={(e) => update("quietEnd", e.target.value)} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button key={d} type="button" aria-pressed={s.reminderDays.includes(i)} onClick={() => update("reminderDays", s.reminderDays.includes(i) ? s.reminderDays.filter((x) => x !== i) : [...s.reminderDays, i])}
                  className={`rounded-full border px-3 py-1 text-sm ${s.reminderDays.includes(i) ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-3"}`}>{d}</button>
              ))}
            </div>
          </fieldset>
          <Button onClick={() => save({ reminderTime: s.reminderTime, quietStart: s.quietStart, quietEnd: s.quietEnd, reminderDays: s.reminderDays })} loading={saving}>Save schedule</Button>

          <div className="rounded-lg border border-line p-3">
            <p className="flex items-center gap-2 font-medium"><Bell className="size-4" aria-hidden /> Push notifications {s.pushEnabled && <Badge tone="sage">on</Badge>}</p>
            {!me.push.configured ? (
              <p className="mt-1 text-sm text-ink-3">Not configured on this server (VAPID keys missing). See the setup guide in the README.</p>
            ) : pushState === "ios-browser" ? (
              <p className="mt-1 text-sm text-ink-2">On iPhone and iPad, web push only works after you add this app to your Home Screen (Share → Add to Home Screen, iOS 16.4 or later) and open it from there.</p>
            ) : pushState === "unsupported" ? (
              <p className="mt-1 text-sm text-ink-3">This browser does not support web push. In-app reminders still work.</p>
            ) : pushState === "denied" ? (
              <p className="mt-1 text-sm text-ink-2">Notifications are blocked for this site. To allow them, change the site&apos;s notification permission in your browser settings.</p>
            ) : s.pushEnabled ? (
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => api("/api/push/test", { method: "POST" }).then(() => toast({ tone: "sage", text: "Test sent" })).catch((e) => toast({ tone: "danger", text: errorMessage(e) }))}>Send test</Button><Button size="sm" variant="ghost" onClick={disablePush}>Turn off on this device</Button></div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-ink-2">Get a short reminder when reviews are due, at your chosen time and outside quiet hours. Your browser will ask for permission after you click.</p>
                <Button size="sm" variant="primary" onClick={enablePush}><Smartphone className="size-4" aria-hidden /> Enable on this device</Button>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-line p-3">
            <Toggle checked={s.emailEnabled} onChange={(v) => { update("emailEnabled", v); void save({ emailEnabled: v }); }} disabled={!me.email.configured}
              label="Email summary" description={me.email.configured ? `Sent to ${me.user.email} on your selected days. Every email has an unsubscribe link.` : "Email delivery is not configured on this server."} />
            <Mail className="hidden" aria-hidden />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg">AI</h2>
          <p className="text-sm">
            Provider: <Badge tone={me.ai.available ? (me.ai.demo ? "warn" : "sage") : "neutral"}>{me.ai.available ? (me.ai.demo ? "demo mode" : `${me.ai.provider} · ${me.ai.model}`) : "not configured"}</Badge>
          </p>
          {me.ai.misconfigured && <Notice tone="warn">The server&apos;s AI provider is not configured correctly (for example, the API key is missing).</Notice>}
          {me.ai.demo && <Notice>Demo mode produces clearly labelled, rule-based output for trying the app. Real explanations and assessments need an API key on the server.</Notice>}
          <p className="text-xs text-ink-3">You do not need an AI account or subscription. AI runs on this site&apos;s server with the operator&apos;s API key, which is never sent to your browser. Because every AI request costs the operator money, your plan includes a monthly allowance.</p>
          {!me.ai.demo && me.ai.available && (
            <div>
              <h3 className="text-sm font-medium">Your AI allowance this month <Badge>{me.allowance.planLabel}</Badge></h3>
              <ul className="mt-2 space-y-2">
                {me.allowance.categories.map((c) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{c.label}</span><span className="tabular-nums text-ink-2">{c.limit === null ? `${c.used} used · no limit` : `${c.used} of ${c.limit}`}</span></div>
                    {c.limit !== null && c.limit > 0 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={c.used >= c.limit ? "h-full bg-danger" : "h-full bg-navy"} style={{ width: `${Math.min(100, (c.used / c.limit) * 100)}%` }} /></div>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Resets on {new Date(me.allowance.resetsAt).toLocaleDateString(undefined, { day: "numeric", month: "long" })}. Reviews, flashcards and all non-AI practice are never limited.</p>
            </div>
          )}
          <Toggle checked={s.aiEnabled} onChange={(v) => { update("aiEnabled", v); void save({ aiEnabled: v }); }} label="Use AI features" description="Turning this off keeps all your data; review and non-AI practice keep working." />
          <Toggle checked={s.aiProfileConsent} onChange={(v) => { update("aiProfileConsent", v); void save({ aiProfileConsent: v }); }} label="Let the tutor use my learning profile" description="Shares frequently forgotten words and recurring writing weaknesses with the tutor to personalise answers." />
          <Button size="sm" variant="ghost" onClick={() => confirm("Reset recurring error patterns and confidence calibration? Vocabulary and history stay.") && api("/api/account/profile-reset", { method: "POST" }).then(() => toast({ tone: "sage", text: "Learner profile reset" }))}>Reset personalised profile</Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg">Appearance and accessibility</h2>
          <Field label="Theme" htmlFor="th"><Select id="th" value={s.theme} onChange={(e) => { update("theme", e.target.value); void save({ theme: e.target.value }); }}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field>
          <Toggle checked={s.reducedMotion} onChange={(v) => { update("reducedMotion", v); void save({ reducedMotion: v }); }} label="Reduce motion" description="Turns off card flips and transitions." />
          <Toggle checked={s.showStreak} onChange={(v) => { update("showStreak", v); void save({ showStreak: v }); }} label="Show study streak" description="Optional; missing a day is never penalised." />
          <div className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
            <p className="flex items-center gap-2 font-medium text-ink"><Download className="size-4" aria-hidden /> Install as an app</p>
            <ul className="mt-1 list-disc pl-5">
              <li>iPhone/iPad (Safari): Share → Add to Home Screen.</li>
              <li>Chrome/Edge (desktop, Android): the install icon in the address bar or menu → Install.</li>
              <li>Previously loaded pages and downloaded sessions work offline; AI features need a connection.</li>
            </ul>
          </div>
        </Card>

        <Card className="space-y-3 lg:col-span-2">
          <h2 className="text-lg">Your data</h2>
          <div className="flex flex-wrap gap-2">
            <a href="/api/account/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[15px] font-medium hover:bg-surface-2"><Download className="size-4" aria-hidden /> Export everything (JSON)</a>
            <Button onClick={() => api<{ created: number }>("/api/sample", { method: "POST" }).then((r) => toast({ tone: "sage", text: `${r.created} sample words added` }))}>Add sample collection</Button>
            <Button onClick={() => confirm("Remove all sample words and sample topics?") && api<{ removed: number }>("/api/sample", { method: "DELETE" }).then((r) => toast({ tone: "neutral", text: `${r.removed} sample words removed` }))}>Remove sample data</Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete account</Button>
          </div>
          <p className="text-xs text-ink-3">Writing and answers are sent to the AI provider only when you request an AI feature, and only the text needed for that request. Request logs store metadata (feature, model, tokens), never your text.</p>
        </Card>
      </div>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account"
        footer={<><Button onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={!password} onClick={async () => {
          try {
            await api("/api/account", { method: "DELETE", json: { password } });
            router.push("/signup");
          } catch (e) {
            toast({ tone: "danger", text: errorMessage(e) });
          }
        }}>Delete permanently</Button></>}>
        <p className="text-sm text-ink-2">This permanently deletes your vocabulary, learning history, writing, uploads and settings. Export first if you want to keep a copy.</p>
        <Field label="Confirm with your password" htmlFor="delpw"><Input id="delpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      </Dialog>
    </>
  );
}
