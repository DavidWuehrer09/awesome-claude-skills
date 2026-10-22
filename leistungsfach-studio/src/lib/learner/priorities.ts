// Chooses the three most valuable learning priorities (adaptive-tutoring SKILL.md). Pure.
import { TASK_TYPES, type TaskTypeKey } from "@/lib/curriculum";
import { SKILLS, SKILL_KEYS, type SkillKey } from "./skills";
import type { MasteryStatus } from "./model";

export type SkillSnapshot = { skillKey: SkillKey; level: number | null; confidence: number; masteryStatus: MasteryStatus; lastTrainedAt: Date | null };
export type AssessmentSignal = { skillKey: SkillKey; priority: number }; // from action_plan
export type Priority = { skillKey: SkillKey; score: number; reason: string };

export function selectPriorities(input: {
  skills: SkillSnapshot[];
  taskType: TaskTypeKey | null;
  actionPlan: AssessmentSignal[];
  recurringBySkill: Partial<Record<SkillKey, number>>;
  now?: Date;
  count?: number;
}): Priority[] {
  const now = input.now ?? new Date();
  const weights = input.taskType ? TASK_TYPES[input.taskType].weights : {};
  const byKey = new Map(input.skills.map((s) => [s.skillKey, s]));
  const out: Priority[] = [];
  for (const key of SKILL_KEYS) {
    const s = byKey.get(key);
    const info = SKILLS[key];
    const reasons: string[] = [];
    let score = 0;
    const relevance = info.dimensions.reduce((m, d) => Math.max(m, (weights as Record<string, number>)[d] ?? 0), 0);
    if (s?.level != null) {
      const gap = Math.max(0, 13 - s.level);
      score += gap * (1 + relevance / 2);
      if (gap > 0) reasons.push(`estimated level ${s.level.toFixed(1)} is ${gap.toFixed(1)} points below the 13+ band`);
    }
    const plan = input.actionPlan.find((a) => a.skillKey === key);
    if (plan) { score += Math.max(0, 8 - plan.priority * 1.5); reasons.push(`priority ${plan.priority} in the latest assessment's action plan`); }
    const rec = input.recurringBySkill[key] ?? 0;
    if (rec) { score += 3 * rec; reasons.push(`${rec} recurring error pattern${rec > 1 ? "s" : ""}`); }
    if (s && s.level != null && s.confidence < 0.4) { score += 1.5; reasons.push("low confidence — needs more evidence"); }
    if (s?.masteryStatus === "secure") score -= 5;
    if (s?.lastTrainedAt && now.getTime() - s.lastTrainedAt.getTime() < 2 * 86400000) { score -= 2; reasons.push("trained in the last two days"); }
    if (score > 0 && reasons.length) out.push({ skillKey: key, score: Math.round(score * 10) / 10, reason: reasons.join("; ") });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, input.count ?? 3);
}
