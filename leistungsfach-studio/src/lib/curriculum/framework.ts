// Runtime mirror of SKILL.md §2 (requirements), §5 (bands) and §7 (modes).
import type { Provenance } from "./sources";

export type Requirement = { id: string; area: string; statement: string; provenance: Provenance; sources: string[] };

export const EA_REQUIREMENTS: Requirement[] = [
  { id: "course", area: "Course", statement: "English eA is a five-lesson Leistungsfach in Years 12 and 13; competences describe the outcome of a two-year learning process.", provenance: "official_reported", sources: ["S5", "S1"] },
  { id: "ea-diff", area: "eA vs gA", statement: "Basic competences apply at both levels; eA differs through higher task complexity, greater depth and breadth of content, longer and more complex texts, and greater independence in solving tasks.", provenance: "official_reported", sources: ["S3", "S5"] },
  { id: "reading", area: "Reading", statement: "Independently understand complex, demanding, longer authentic texts, including abstract topics; recognise explicit and implicit statements and analyse their intended effect (Wirkungsabsicht).", provenance: "official_reported", sources: ["S1"] },
  { id: "writing-12", area: "Writing (12)", statement: "Plan writing processes independently throughout and carry them out accurately and appropriately for the addressee; write complex texts on a broad range of topics, engaging argumentatively, in a differentiated and nuanced way, with different positions.", provenance: "official_reported", sources: ["S1"] },
  { id: "writing-13", area: "Writing (13)", statement: "Independently write complex argumentative texts adapted to addressee and situation.", provenance: "official_reported", sources: ["S2"] },
  { id: "text-media", area: "Text and media", statement: "Analyse literary and non-literary texts with textual evidence, including the effect of design features.", provenance: "official_reported", sources: ["S1"] },
];

export const ABITUR_FORMAT = {
  provenance: "official_reported" as Provenance,
  sources: ["S5", "S6", "S7", "S8"],
  parts: [
    { part: "A", name: "Listening (Hörverstehen)", minutes: 30, weightPercent: 20 },
    { part: "B", name: "Writing (Schreiben): non-literary or literary task; 1 comprehension, 2 analysis, 3 comment or creative writing", minutes: null, weightPercent: 55 },
    { part: "C", name: "Mediation (Sprachmittlung), German → English, source ≤ 650 words", minutes: null, weightPercent: 25 },
  ],
  writingAndMediationMinutesEA: 285,
  sourceTextMaxWordsEA: 1000,
  mediationSourceMaxWords: 650,
  notes: [
    "Topics come from a binding list of Themengebiete in the LehrplanPLUS — the list could not be retrieved; add it under Curriculum sources.",
    "A new operator set applies from the 2027 exam year (Kontaktbrief 2025); its content could not be retrieved.",
    "The app cannot run listening comprehension; use the ISB illustrative tasks for listening practice.",
  ],
};

export const ASSESSMENT_RULES = {
  scale: "0–15 Notenpunkte per sub-task",
  rubricColumns: ["Inhalt und Textstruktur (content & structure)", "Sprache (language)"],
  contentWeight: 0.4,
  languageWeight: 0.6,
  contentCapThreshold: 3,
  contentCapValue: 3,
  provenance: "official_reported" as Provenance,
  sources: ["S9", "S11", "S12"],
  label:
    "Reported in the KMS on written exam formats: content : language = 40 : 60, and content below 3 points caps the sub-task at 3. Unverified — may date from the 2020 KMS.",
};

export const BANDS = [
  { min: 13, max: 15, name: "Exceptional", content: "Fulfils the operator completely and independently; insightful, nuanced, precise; every claim supported; structure serves the argument.", language: "Wide, precise, idiomatic repertoire; complex syntax under control; errors rare and minor; register consistently apt." },
  { min: 10, max: 12, name: "Good", content: "Fulfils the task well; mostly developed analysis or argument with some unevenness; good evidence; clear structure.", language: "Good range; mostly idiomatic; some errors that do not impede understanding." },
  { min: 7, max: 9, name: "Satisfactory", content: "Fulfils the task in essentials; partly descriptive or generalised; evidence present but not always explained; structure recognisable.", language: "Adequate but limited or repetitive range; noticeable interference; errors sometimes distract." },
  { min: 4, max: 6, name: "Weak, with deficiencies", content: "Task partly missed; mainly retelling or listing; little explanation; weak structure.", language: "Limited range; frequent errors; meaning sometimes unclear." },
  { min: 1, max: 3, name: "Serious deficiencies", content: "Task largely missed; content fragmentary or inaccurate.", language: "Errors pervasive; meaning often obscured." },
  { min: 0, max: 0, name: "No assessable performance", content: "Off-task or absent.", language: "Not assessable." },
] as const;

export const BAND_DISTINCTIONS = [
  "9 → 12: from 'identifies devices and gives a general effect' to 'explains the specific effect in context and links it to the purpose'.",
  "12 → 15: from good analysis to independent, nuanced insight (tension between strategies, audience-dependence of effect, limits of persuasiveness) expressed precisely and economically.",
  "Language at 15 is precise, natural and controlled — not ornate. Unnatural elaborate vocabulary lowers the language mark.",
];

export function bandFor(points: number) {
  return BANDS.find((b) => points >= b.min && points <= b.max) ?? BANDS[BANDS.length - 1];
}

/** Bavarian Oberstufe points → German grade label (well-established convention). */
export function gradeLabel(points: number): string {
  const map: Record<number, string> = { 15: "1+", 14: "1", 13: "1-", 12: "2+", 11: "2", 10: "2-", 9: "3+", 8: "3", 7: "3-", 6: "4+", 5: "4", 4: "4-", 3: "5+", 2: "5", 1: "5-", 0: "6" };
  return map[Math.max(0, Math.min(15, Math.round(points)))];
}

export const MODES = ["supportive", "teacher_standard", "strict"] as const;
export type AssessmentMode = (typeof MODES)[number];

export const MODE_INFO: Record<AssessmentMode, { label: string; short: string; borderline: string; framing: string }> = {
  supportive: {
    label: "Supportive", short: "Encouraging, a little more generous on borderline cases — still honest.",
    borderline: "When the evidence genuinely supports two adjacent bands, choose the higher one. Never award a band the evidence does not support.",
    framing: "Lead with real strengths (quoted). Limit the action plan to the three most valuable priorities, but still name every major weakness plainly.",
  },
  teacher_standard: {
    label: "Teacher standard", short: "A realistic, evidence-based estimate of likely performance.",
    borderline: "Resolve borderline cases as the evidence most probably supports. If teacher-calibration evidence is provided, take it into account and say so.",
    framing: "Balanced: strengths, the most consequential weaknesses, prioritised action plan.",
  },
  strict: {
    label: "Strict", short: "A demanding stress test of what stands between this and 15 points.",
    borderline: "When in doubt, choose the lower band. Award 13+ on a dimension only if you can quote explicit evidence of top-band quality for it.",
    framing: "Frame feedback around 'what prevents this from reaching 15?'. Be specific and unsparing, but not discouraging or sarcastic.",
  },
};
