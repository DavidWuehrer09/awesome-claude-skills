import type { Assessment, Exam } from "@/domain/examiner/model";

export const SOURCE = "The council finally agreed to close the old harbour road to cars. Shopkeepers warned that fewer visitors would come, while cyclists celebrated a safer route along the water.";

export function sampleExam(over: Partial<Exam> = {}): Exam {
  return {
    title: "Practice Klausur: Cities", topic: "Cities", examType: "Klausur", difficulty: "realistic", durationMinutes: 90,
    permittedResources: [], generalInstructions: "",
    sources: [{ id: "S1", title: "Harbour road", kind: "fictional_practice", label: "Fictional practice text", materialId: null, lineNumbered: true, text: SOURCE, citation: null }],
    tasks: [
      { number: "1", type: "summary", operator: "Summarise", instruction: "Summarise the text in about 80 words.", sourceIds: ["S1"], expectedLength: { min: 60, max: 100, unit: "words" }, suggestedMinutes: 20, points: null },
      { number: "2", type: "comment", operator: "Comment", instruction: "Comment on whether cities should ban cars from their centres.", sourceIds: [], expectedLength: null, suggestedMinutes: 60, points: null },
    ],
    marking: { origin: "none", label: "", totalPoints: null, sourceMaterialIds: [], criteria: [] },
    hidden: {
      taskExpectations: [
        { task: "1", expectedContent: ["decision to close the road", "two reactions"], acceptableAlternatives: [], markingNotes: "SECRET-NOTE", commonPitfalls: [] },
        { task: "2", expectedContent: ["position", "counterargument"], acceptableAlternatives: [], markingNotes: "", commonPitfalls: [] },
      ],
      vocabularyTargets: ["to mitigate"], weaknessTargets: [],
    },
    provenance: { formatBasedOn: [], profileEntriesUsed: [], notes: "", assumptions: [], conflicts: [] },
    ...over,
  };
}

export const ANSWERS = {
  "1": "The council has decided to close the harbour road to cars. Shopkeepers fear losing customers, but cyclists welcome the safer route.",
  "2": "Banning cars from city centres is a good idea because it makes streets safer. However, shops could lose business. I think it's worth it.",
};

export function validAssessment(over: Partial<Assessment> = {}): Assessment {
  return {
    courseSpecific: { rubricBasis: "none_available", rubricMaterialIds: [], summary: "No teacher rubric.", appliedCriteria: [], insufficientEvidenceNotes: ["No rubric uploaded."] },
    independent: { summary: "Clear and accurate.", standardsNote: "" },
    dimensions: [{ key: "task_fulfilment", task: "1", applicable: true, level: "strong", comment: "Covers the main points." }],
    strengths: [{ task: "1", original: "cyclists welcome the safer route", whyStrong: "Concise paraphrase." }],
    comments: [{
      id: "c1", task: "2", original: "I think it's worth it.", problem: "Informal conclusion.", whyWeakens: "Weak ending.", alternative: "On balance, the benefits outweigh the costs.",
      whyBetter: "It weighs both sides.", category: "style", englishStatus: "valid_less_effective", severity: "moderate", provenance: "general_principle", dimension: "register",
    }],
    estimate: { low: 9, high: 11, best: 10, basis: "approximation", assumptions: ["No teacher rubric"], evidence: ["Summary complete"], limitingFactors: ["Thin argument"], mostValuableChanges: ["Develop the counterargument"] },
    improvementPlan: [{ priority: 1, focus: "Argument", action: "Add a rebuttal.", skill: "underdeveloped_counterarguments" }],
    lab: [],
    modelAnswer: { perTask: [{ task: "2", text: "City centres without cars are safer, as the text notes that \"cyclists celebrated a safer route\".", whyEffective: [] }], alternativeInterpretations: [], comparisons: [] },
    weaknessObservations: [{ skill: "register_slips", present: true, severity: "minor", commentIds: ["c1"], note: "" }],
    vocabUsage: [],
    ...over,
  };
}

