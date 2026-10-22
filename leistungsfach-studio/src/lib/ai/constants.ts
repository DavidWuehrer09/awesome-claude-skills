// Client-safe constants shared by schemas, services and UI.
export const REVISION_CATEGORIES = ["grammar", "idiomatic", "precision", "structure_cohesion", "deeper_analysis", "argumentation", "evidence", "register_genre"] as const;
export type RevisionCategory = (typeof REVISION_CATEGORIES)[number];
export const EXERCISE_TYPES = ["diagnostic", "sentence_improvement", "device_analysis", "evidence_interpretation", "paragraph_reconstruction", "collocation", "grammar", "timed_task", "transfer"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export const DIFFICULTIES = ["foundation", "core", "stretch", "exam"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
