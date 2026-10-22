// Fixture texts written for the test suite (not real student work or real publications).
export const SOURCE_TEXT = `[Practice text written for the test suite]
The town council has announced that the youth centre will close next spring. Officials say the decision is purely financial.
"We cannot keep paying for empty rooms," the mayor said (l. 3). Yet the centre's own records show that more than two hundred teenagers use it every week.
For many of them it is the only warm, safe place after school. Closing it, critics argue, will cost the town far more in the long run.`;

export const ESSAY_TEXT = `The article deals with the planned closure of a youth centre and criticises the council's decision.
The author uses a quotation from the mayor to show his opinion. He also discusses about the consequences for teenagers.
The contrast between "empty rooms" and the two hundred teenagers makes the reader think about the topic.

In conclusion, the author uses many stylistic devices to convince the reader that the closure is a mistake.`;

export const ESSAY_INPUT = {
  title: "Youth centre article – analysis",
  taskType: "nonfiction_analysis" as const,
  operator: "analyse",
  taskPrompt: "Analyse how the author tries to convince the reader that closing the youth centre is a mistake.",
  sourceText: SOURCE_TEXT,
  essayText: ESSAY_TEXT,
  rubricText: "",
  context: "practice" as const,
  timeLimitMinutes: null,
  timeUsedMinutes: null,
  parentEssayId: null,
  writtenAt: null,
};
