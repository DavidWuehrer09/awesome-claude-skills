import type { Exercise } from "@/domain/learning/exercises";

export type RunnerCard = {
  exercise: Exercise;
  reason: string;
  schedule: boolean;
  intervals: Record<number, string> | null;
  /** For AI-generated exercises: how to evaluate free answers. */
  ai?: { task: "translation" | "transformation" | "error_correction" | "sentence_lab" | "production"; reference: string[]; source?: string | null };
};

export const REASON_TEXT: Record<string, string> = {
  overdue: "Overdue",
  due: "Due today",
  relearning: "Recently forgotten",
  new: "New word",
  weak_production: "Strengthen active use",
  weak_collocation: "Strengthen collocations",
  not_in_writing: "Ready for writing",
  difficult: "Difficult word",
  practice: "Practice",
  selected: "Selected",
  retry: "Second chance",
  generated: "Generated exercise",
};
