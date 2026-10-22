"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIFFICULTIES, EXERCISE_TYPES, type Difficulty, type ExerciseType } from "@/lib/ai/constants";
import { SKILL_KEYS, SKILLS, type SkillKey } from "@/lib/learner/skills";
import { api, errorMessage } from "@/lib/client/api";
import { Button, Card, CardTitle, ErrorNotice, Field, LoadingNotice, Select } from "@/components/ui";

export const TYPE_LABEL: Record<ExerciseType, string> = {
  diagnostic: "Diagnostic questions", sentence_improvement: "Sentence improvement", device_analysis: "Stylistic-device analysis",
  evidence_interpretation: "Evidence & interpretation", paragraph_reconstruction: "Paragraph reconstruction", collocation: "Collocations & vocabulary",
  grammar: "Grammar (from your errors)", timed_task: "Timed exam task", transfer: "Transfer to a new text",
};

type Opts = { skillKey: SkillKey; type?: ExerciseType; difficulty?: Difficulty; isTransfer?: boolean; errorPatternId?: string | null; sourceEssayId?: string | null; reason?: string };

export function useGenerate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generate = async (o: Opts) => {
    setBusy(true); setError(null);
    try { const ex = await api<{ id: string }>("/api/exercises", { body: o }); router.push(`/training/${ex.id}`); }
    catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return { busy, error, generate };
}

export function StartButton({ label = "Start exercise", ...o }: Opts & { label?: string }) {
  const { busy, error, generate } = useGenerate();
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => generate(o)} loading={busy}>{busy ? "Creating…" : label}</Button>
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

export function CustomExercise({ sourceEssayId }: { sourceEssayId?: string | null }) {
  const { busy, error, generate } = useGenerate();
  const [skillKey, setSkill] = useState<SkillKey>("analytical_depth");
  const [type, setType] = useState<ExerciseType | "">("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  return (
    <Card>
      <CardTitle>Choose your own practice</CardTitle>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); generate({ skillKey, type: type || undefined, difficulty: difficulty || undefined, isTransfer: type === "transfer", sourceEssayId: sourceEssayId ?? null }); }}>
        <Field label="Skill" htmlFor="c-skill">
          <Select id="c-skill" value={skillKey} onChange={(e) => setSkill(e.target.value as SkillKey)}>{SKILL_KEYS.map((k) => <option key={k} value={k}>{SKILLS[k].label}</option>)}</Select>
        </Field>
        <Field label="Exercise type" htmlFor="c-type" hint="Leave on automatic to let the tutor choose based on your profile.">
          <Select id="c-type" value={type} onChange={(e) => setType(e.target.value as ExerciseType | "")}>
            <option value="">Automatic</option>{EXERCISE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Difficulty" htmlFor="c-diff" hint="Automatic adapts to your recent results.">
          <Select id="c-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
            <option value="">Automatic</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        {busy && <LoadingNotice title="Designing your exercise…" detail="Usually 15–40 seconds." />}
        {error && <ErrorNotice message={error} />}
        <Button type="submit" loading={busy} className="w-full">Create exercise</Button>
      </form>
    </Card>
  );
}
