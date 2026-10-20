"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Notice, Select, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Ai = { provider: string; demo: boolean; available: boolean };

export function Onboarding({ name, ai }: { name: string | null; ai: Ai }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(15);
  const [level, setLevel] = useState("C1");
  const [goal, setGoal] = useState("Abitur (Leistungsfach) – aiming for 15 points");
  const [examDate, setExamDate] = useState("");
  const [reminder, setReminder] = useState("17:30");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [remindersWanted, setRemindersWanted] = useState(false);
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    let tz = "Europe/Berlin";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    } catch {
      /* keep default */
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        json: { sessionMinutes: minutes, targetLevel: level, mainGoal: goal || null, examDate: examDate || null, reminderTime: reminder, aiEnabled, timezone: tz, onboarded: true },
      });
      if (sample) await api("/api/sample", { method: "POST" });
      router.push(remindersWanted ? "/settings#reminders" : "/home");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm uppercase tracking-wider text-ink-3">Welcome{name ? `, ${name}` : ""}</p>
      <h1 className="mt-1 text-3xl">Let&apos;s set up your study space</h1>
      <p className="mt-2 text-ink-2">A few choices that shape your sessions. Everything can be changed later in Settings.</p>
      <Card className="mt-6 space-y-5">
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usual study time per session" htmlFor="minutes">
            <Select id="minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[5, 10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </Select>
          </Field>
          <Field label="Target level" htmlFor="level">
            <Select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="B2">B2 (consolidate)</option>
              <option value="C1">C1 (advanced)</option>
              <option value="C2">C2 (mastery)</option>
            </Select>
          </Field>
        </div>
        <Field label="Main goal" htmlFor="goal">
          <Input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam date (optional)" htmlFor="exam">
            <Input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </Field>
          <Field label="Preferred reminder time" htmlFor="rem" hint="Your device time zone is used; change it later in Settings.">
            <Input id="rem" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </Field>
        </div>
        <div className="divide-y divide-line">
          <Toggle checked={aiEnabled} onChange={setAiEnabled} label="Use AI features"
            description={ai.available ? (ai.demo ? "This server runs in demo mode: AI answers are clearly labelled demos." : "Explanations, sentence feedback, essay assessment and more.") : "No AI provider is configured on this server yet; you can still use everything else."} />
          <Toggle checked={remindersWanted} onChange={setRemindersWanted} label="Set up reminders next" description="Push notifications and email are opt-in; we ask for permission only after you choose them." />
          <Toggle checked={sample} onChange={setSample} label="Start with a small sample collection" description="12 advanced words in three topics, marked as sample data and easy to remove." />
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={finish} loading={busy}>Start learning</Button>
      </Card>
    </div>
  );
}
