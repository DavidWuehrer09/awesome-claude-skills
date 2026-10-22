import { notFound } from "next/navigation";
import { ExerciseRunner, type ExerciseData } from "@/components/training/ExerciseRunner";
import { TYPE_LABEL } from "@/components/training/GenerateExercise";
import { Badge, MockBadge, PageHeader } from "@/components/ui";
import type { ExerciseType } from "@/lib/ai/constants";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { getExercise } from "@/server/services/training";
import { AppError } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ex;
  try { ex = await getExercise(id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  const data = JSON.parse(JSON.stringify(ex)) as ExerciseData;
  return (
    <>
      <PageHeader
        title={data.content.title}
        intro={<span className="flex flex-wrap items-center gap-2"><Badge tone="accent">{SKILLS[ex.skillKey as SkillKey]?.label}</Badge><Badge>{TYPE_LABEL[ex.type as ExerciseType]}</Badge><Badge>{ex.difficulty}</Badge>{ex.isTransfer && <Badge tone="good">transfer</Badge>}{ex.timeLimitMinutes && <Badge>{ex.timeLimitMinutes} min</Badge>}<MockBadge provider={ex.provider} /></span>}
      />
      <ExerciseRunner initial={data} />
    </>
  );
}
