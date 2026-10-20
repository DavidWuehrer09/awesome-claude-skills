/**
 * Built-in practice prompts. All source texts below were written for this
 * application; they are fictional and are labelled as such in the UI. None
 * reproduces an examination paper or a published text.
 */
import type { TaskType } from "./rubrics";

export type Section = "sentence" | "paragraph" | "vocab_context" | "argument" | "refinement" | "editing" | "timed" | "essay" | "abitur";

export type LibraryPrompt = {
  key: string;
  section: Section;
  taskType: TaskType;
  title: string;
  instructions: string;
  sourceText?: string;
  sourceLabel?: string;
  minWords?: number;
  maxWords?: number;
  timeLimitMinutes?: number;
  answerKey?: string;
  topic: string;
};

const ORIGINAL = "Original text written for this app (fictional; not a real publication).";

export const LIBRARY: LibraryPrompt[] = [
  {
    key: "abitur-comment-age-verification",
    section: "abitur", taskType: "comment", topic: "Media and Technology",
    title: "Comment: compulsory age verification on social media",
    instructions: "“Social media platforms should be legally required to verify the age of every user.” Comment on this statement. Write about 300–350 words.",
    minWords: 300, maxWords: 350, timeLimitMinutes: 60,
  },
  {
    key: "abitur-discussion-ai-school",
    section: "abitur", taskType: "discussion", topic: "Education",
    title: "Discussion: AI writing tools in the classroom",
    instructions: "Discuss whether students should be allowed to use AI writing assistants for homework. Weigh arguments on both sides and reach a reasoned conclusion. Write about 350 words.",
    minWords: 320, maxWords: 380, timeLimitMinutes: 70,
  },
  {
    key: "abitur-analysis-mayor-speech",
    section: "abitur", taskType: "non_fiction_analysis", topic: "Environment",
    title: "Analysis: a mayor's speech on flood defences",
    instructions: "Analyse how the speaker tries to win the audience's support for the new flood-defence plan. Focus on structure and use of language. Refer to the text using line numbers. Write about 400 words.",
    minWords: 350, maxWords: 450, timeLimitMinutes: 80, sourceLabel: ORIGINAL,
    sourceText: `Friends, neighbours, fellow citizens of Elmbridge,

Three winters ago, many of you stood where I am standing now and watched the river take what it had never taken before. It took the bakery on Mill Lane. It took the cricket pavilion your grandparents built. It took, for a few terrible hours, our certainty that this town was safe.

I will not pretend that the plan before you is cheap. It is not. I will not pretend that it is painless. Some of you will lose a view, and some of you will lose a parking space you have used for thirty years. But I ask you this: what is a view worth when the water is at your door?

The engineers tell us that floods of that size will no longer come once a century, but perhaps once a decade. The insurers tell us the same thing in a language that is harder to ignore: higher premiums, smaller payouts, and, for some streets, no cover at all.

We can wait. We can hope. We can tell ourselves that the river will remember its manners. Or we can act while acting is still a choice rather than a necessity.

This plan does not ask us to fight nature. It asks us to make room for it: to give the river fields to spread into, so that it has no reason to visit our kitchens. It is not a wall built in fear; it is an agreement made with foresight.

When your children ask what we did when we knew, let us have an answer we are proud to give.`,
  },
  {
    key: "abitur-literary-station",
    section: "abitur", taskType: "literary_analysis", topic: "Literature and Film",
    title: "Literary analysis: “The Last Train”",
    instructions: "Analyse how the atmosphere of the extract is created and what it reveals about the narrator's state of mind. Write about 400 words.",
    minWords: 350, maxWords: 450, timeLimitMinutes: 80, sourceLabel: ORIGINAL,
    sourceText: `The station clock had stopped at ten past four, which seemed to Nora like a decision rather than an accident. Nobody had come to fix it. Nobody, she suspected, would.

She sat on the only bench that still had all its slats and counted the things the town had lost since she left: the cinema, the second bakery, the boy who used to sell newspapers outside the post office and wink at her mother. The list was longer than she had expected, and she stopped before she reached the end of it.

A gust of wind pushed an empty crisp packet along the platform. It travelled a few metres, hesitated at the yellow line, and turned back, as if it, too, had thought better of leaving.

Her phone showed no signal. On the timetable, someone had written in careful blue biro: LAST TRAIN – ASK. There was no one to ask.

She thought about the city, where the trains came every three minutes and nobody looked up when they did. She had been proud of that once – of being someone who did not need to look up.

When the headlights finally appeared, small and trembling at the far end of the valley, she realised she was standing, and that she had been standing for some time.`,
  },
  {
    key: "abitur-mediation-handyverbot",
    section: "abitur", taskType: "mediation", topic: "Education",
    title: "Mediation: phone ban at German schools",
    instructions: "Your partner school in Leeds is preparing a debate on smartphones in schools and has asked how the issue is handled in Germany. Based on the German text, write an article for their school magazine in which you explain the situation at the school described and the main arguments. Write about 250 words.",
    minWords: 220, maxWords: 280, timeLimitMinutes: 50, sourceLabel: "Original German text written for this app (fictional).",
    sourceText: `Seit Beginn des Schuljahres gilt am Max-Planck-Gymnasium in Nordstadt ein striktes Handyverbot: Von der ersten bis zur letzten Stunde bleiben Smartphones ausgeschaltet im Schulranzen. Wer erwischt wird, muss das Gerät bis zum Schulschluss im Sekretariat abgeben.

Die Schulleitung begründet die Regel mit einer Umfrage unter Lehrkräften. Demnach sei die Konzentration im Unterricht spürbar gesunken, und in den Pausen werde kaum noch miteinander gesprochen. „Wir wollen den Schulhof wieder zu einem Ort machen, an dem man sich begegnet“, sagt Schulleiterin Dr. Petra Lang.

Nicht alle sind überzeugt. Der Elternbeirat begrüßt die Maßnahme zwar grundsätzlich, fordert aber Ausnahmen für Schülerinnen und Schüler mit langen Schulwegen, die ihre Eltern erreichen müssen. Die Schülervertretung kritisiert, dass sie nicht in die Entscheidung einbezogen wurde. Außerdem werde das Smartphone im Unterricht oft sinnvoll genutzt, etwa für Recherchen oder Vokabel-Apps.

Erste Erfahrungen fallen gemischt aus. Einige Lehrkräfte berichten von ruhigeren Pausen und mehr Gesprächen, andere beobachten, dass Jugendliche die Geräte nun heimlich auf der Toilette nutzen. Im Frühjahr will die Schule gemeinsam mit Eltern und Schülervertretung Bilanz ziehen.`,
  },
  {
    key: "abitur-comparison-speech-story",
    section: "abitur", taskType: "comparison", topic: "Society and Identity",
    title: "Comparison: ideas of home",
    instructions: "Compare how the speech on flood defences (Analysis task) and the extract “The Last Train” (Literary task) present the relationship between people and the place they come from. Write about 350 words.",
    minWords: 320, maxWords: 380, timeLimitMinutes: 70,
  },
  {
    key: "paragraph-local-elections",
    section: "paragraph", taskType: "paragraph", topic: "Politics and Democracy",
    title: "Paragraph: Do local elections matter more than national ones?",
    instructions: "Write ONE paragraph (120–160 words) arguing that local elections deserve more attention from young voters. Use a clear topic sentence, develop one argument with an example, qualify your claim, and end with a link to the wider issue.",
    minWords: 120, maxWords: 160,
  },
  {
    key: "argument-concession",
    section: "argument", taskType: "paragraph", topic: "Media and Technology",
    title: "Argumentation Studio: concede without surrendering",
    instructions: "Position: “Schools should teach media literacy as a separate subject.” Write a paragraph (100–140 words) that first concedes a strong counterargument fairly and then explains why your position still holds. Do not use “On the one hand … on the other hand”.",
    minWords: 100, maxWords: 140,
  },
  {
    key: "argument-thesis",
    section: "argument", taskType: "sentence", topic: "Environment",
    title: "Argumentation Studio: build a defensible thesis",
    instructions: "Topic: banning short-haul domestic flights. Write three thesis statements of increasing precision: (1) a simple position, (2) a position with a reason, (3) a qualified position with a reason and a limit. Explain in one sentence why (3) is the most defensible.",
  },
  {
    key: "refinement-vague",
    section: "refinement", taskType: "paragraph", topic: "Academic Writing",
    title: "Stylistic refinement: from vague to precise",
    instructions: "Revise the paragraph for precision, concision and register. Keep the ideas; remove repetition and vague language. Aim for about 30% fewer words.",
    sourceLabel: "Practice paragraph written for this app.",
    sourceText: "In today's society there are a lot of problems with social media and many people think that it is a very big problem for young people. Social media does a lot of bad things to young people because they are on their phones a lot and this makes them feel bad about themselves. There are also some good things about social media, for example that people can talk to their friends. But all in all I think that the bad things are more important than the good things and something should be done about it.",
    answerKey: "Model (one of many): “Social media is widely blamed for harming young people's self-esteem. Constant comparison with curated images can leave teenagers feeling inadequate, even though the same platforms help them keep in touch with friends. On balance, the psychological costs appear to outweigh these social benefits, which suggests that schools and parents should respond more decisively.”",
  },
  {
    key: "editing-planted",
    section: "editing", taskType: "paragraph", topic: "Academic Writing",
    title: "Proofreading: find the six errors",
    instructions: "This paragraph contains six errors (articles, prepositions, agreement, collocation, register, spelling). Correct them in a revised version. Work in passes: grammar → vocabulary → logic.",
    sourceLabel: "Practice paragraph written for this app.",
    sourceText: "The author argues that the climate change is a problem which concern everybody. He makes a strong point that governments are responsible of protecting future generations. However, his argument becomes less convincing when he says that individual actions are pretty useless, because he does not give any evidences for this claim. Furthermore, his conclusion does a big impact on the reader.",
    answerKey: "the climate change → climate change (article); concern → concerns (agreement); responsible of → responsible for (preposition); pretty useless → largely futile (register); evidences → evidence (uncountable); does a big impact → makes a strong impression / has a considerable impact (collocation).",
  },
  {
    key: "timed-commentary-30",
    section: "timed", taskType: "comment", topic: "Society and Identity",
    title: "Timed writing (30 min): Should voting be compulsory?",
    instructions: "Comment on the proposal that voting should be compulsory in Germany. Write about 250 words in 30 minutes.",
    minWords: 230, maxWords: 280, timeLimitMinutes: 30,
  },
];

export const SENTENCE_LAB: { key: string; focus: string; sentence: string; model: string; why: string }[] = [
  { key: "s1", focus: "Precision (vague verb)", sentence: "The author uses many rhetorical devices to show that the issue is important.", model: "Through a series of rhetorical questions, the author presses the reader to confront the issue's urgency.", why: "Names the device and its effect; replaces 'show' and 'important' with a precise claim. Only valid if the text really uses rhetorical questions." },
  { key: "s2", focus: "Redundancy", sentence: "In my personal opinion I think that the reason why this happens is because of social pressure.", model: "This is largely due to social pressure.", why: "Removes three redundancies ('personal opinion', 'I think', 'the reason why … is because')." },
  { key: "s3", focus: "Combining sentences", sentence: "Many teenagers use social media. They compare themselves with others. This can damage their self-esteem.", model: "Because many teenagers constantly compare themselves with others on social media, their self-esteem can suffer.", why: "Subordination shows the causal link instead of listing facts." },
  { key: "s4", focus: "Register", sentence: "The government should totally stop this stuff because it's really bad for kids.", model: "The government should prohibit such practices, as they are demonstrably harmful to children.", why: "Formal vocabulary, no contractions, and a claim that can be supported." },
  { key: "s5", focus: "Collocation", sentence: "This decision did a big impact on the economy.", model: "This decision had a considerable impact on the economy.", why: "'have/make an impact'; 'considerable' collocates naturally with 'impact'." },
  { key: "s6", focus: "Nuance / hedging", sentence: "Video games make young people violent.", model: "Some studies suggest that violent video games may increase short-term aggression in certain players.", why: "Appropriate qualification instead of an absolute claim the evidence cannot support." },
  { key: "s7", focus: "Syntax variation", sentence: "The speaker is a politician. The speaker wants votes. The speaker uses emotional language.", model: "Keen to win votes, the politician appeals to the audience's emotions.", why: "An introductory adjective phrase avoids three identical sentence openings." },
  { key: "s8", focus: "Transitions", sentence: "Social media connects people. Social media spreads misinformation.", model: "While social media connects people across distances, it also accelerates the spread of misinformation.", why: "'While … also' expresses contrast within one balanced sentence." },
  { key: "s9", focus: "Concision", sentence: "At this point in time, it is important to note that there are many people who are not in agreement with the new law.", model: "Many people currently oppose the new law.", why: "Twenty-four words become seven without losing content." },
  { key: "s10", focus: "Already excellent?", sentence: "The ending is ambiguous.", model: "The ending is ambiguous.", why: "Sometimes the simple sentence is the best one. Add detail only if you then explain the ambiguity." },
];
