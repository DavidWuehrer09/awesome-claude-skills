/**
 * Built-in short drills, one per tracked skill. Written for this app (no
 * copied exam material). Used without an AI provider and as examples for the
 * AI-generated drills.
 */
export type Drill = { skill: string; kind: "rewrite" | "short_paragraph" | "identify" | "plan"; instruction: string; material: string | null; modelAnswer: string | null; checklist: string[] };

export const DRILL_BANK: Record<string, Drill> = {
  repetitive_analytical_phrasing: {
    skill: "repetitive_analytical_phrasing", kind: "rewrite",
    instruction: "Rewrite the three sentences so that each uses a different, precise analytical verb instead of “shows”.",
    material: "The headline shows that the paper supports the strike. The photo shows the workers' anger. The final quote shows that the conflict is not over.",
    modelAnswer: "The headline signals the paper's support for the strike. The photo foregrounds the workers' anger. The final quote suggests that the conflict is far from over.",
    checklist: ["Three different verbs", "Each verb fits what the element actually does (signal, emphasise, imply…)", "No change in meaning"],
  },
  vague_authorial_intention: {
    skill: "vague_authorial_intention", kind: "rewrite",
    instruction: "Make the claim about the author's intention precise: who is addressed, what reaction is intended, and through which means.",
    material: "The author wants to make the reader think about the topic.",
    modelAnswer: "By opening with a personal anecdote, the author tries to make undecided readers question their assumption that the problem does not affect them.",
    checklist: ["Names the target audience", "Names a concrete intended reaction", "Links the intention to a textual means"],
  },
  insufficient_textual_evidence: {
    skill: "insufficient_textual_evidence", kind: "rewrite",
    instruction: "Support the claim with a short quotation (with a line reference, invent one) and explain how the quotation proves the claim.",
    material: "The narrator feels isolated in the new city.",
    modelAnswer: "The narrator feels isolated in the new city: she describes herself as “a ghost among commuters” (l. 12), a metaphor suggesting that nobody notices her.",
    checklist: ["Short, integrated quotation", "Line reference", "Explanation of how the quote supports the claim"],
  },
  underdeveloped_counterarguments: {
    skill: "underdeveloped_counterarguments", kind: "short_paragraph",
    instruction: "Write 3–4 sentences: state the strongest counterargument to the thesis fairly, then refute or qualify it.",
    material: "Thesis: Schools should ban smartphones during the whole school day.",
    modelAnswer: "Admittedly, smartphones can be valuable learning tools, for example for quick research or language apps. However, these benefits can be provided by school devices under supervision, without the constant distraction of private notifications. A ban therefore does not prevent digital learning; it only separates it from social media.",
    checklist: ["Counterargument stated at its strongest", "Signal words (admittedly, however…)", "A reasoned refutation or qualification, not just a denial"],
  },
  weak_transitions: {
    skill: "weak_transitions", kind: "rewrite",
    instruction: "Write a transition sentence that links the two paragraphs logically (not just “Furthermore”).",
    material: "Paragraph 1 ends: …so tourism brings much-needed income to the island.\nParagraph 2 is about overcrowded beaches and rising rents for locals.",
    modelAnswer: "Yet the very success that fills the island's coffers is beginning to make it unaffordable for those who live there.",
    checklist: ["Picks up the idea of paragraph 1", "Signals the contrast", "Leads into paragraph 2's topic"],
  },
  awkward_collocations: {
    skill: "awkward_collocations", kind: "rewrite",
    instruction: "Correct the collocations marked with *.",
    material: "The government *made* a decision to *do* measures against pollution, which had a *big* impact and *raised* awareness *about* the problem.",
    modelAnswer: "The government took a decision to take measures against pollution, which had a significant impact and raised awareness of the problem.",
    checklist: ["take a decision / take measures", "significant/considerable impact", "awareness of"],
  },
  grammar_errors: {
    skill: "grammar_errors", kind: "rewrite",
    instruction: "Find and correct the four grammar errors.",
    material: "If the government would invest more, less people would suffer. The informations in the text shows that the problem exist since years.",
    modelAnswer: "If the government invested more, fewer people would suffer. The information in the text shows that the problem has existed for years.",
    checklist: ["No “would” in the if-clause", "fewer + countable noun", "information is uncountable", "present perfect with “for years”"],
  },
  imprecise_vocabulary: {
    skill: "imprecise_vocabulary", kind: "rewrite",
    instruction: "Replace the vague words with precise ones.",
    material: "The speech has a lot of good things in it and the speaker uses many things to make people feel bad about the situation.",
    modelAnswer: "The speech contains several persuasive devices, and the speaker uses emotive examples and loaded vocabulary to make the audience feel guilty about the situation.",
    checklist: ["No “things”/“a lot of”", "Names concrete devices", "Names the precise emotion"],
  },
  excessive_complexity: {
    skill: "excessive_complexity", kind: "rewrite",
    instruction: "Split and simplify the sentence without losing information.",
    material: "It could be argued that the author, who in the text which was published in 2023 discusses the issue of remote work, which has become more common, is of the opinion that it has more advantages than disadvantages, although he also mentions problems.",
    modelAnswer: "In his 2023 article on the rise of remote work, the author argues that its advantages outweigh its disadvantages. He does, however, acknowledge some problems.",
    checklist: ["Two clear sentences", "Main claim first", "No information lost"],
  },
  inadequate_task_fulfilment: {
    skill: "inadequate_task_fulfilment", kind: "plan",
    instruction: "Underline the operator and write a three-point plan that answers exactly this task.",
    material: "Task: Examine how the author presents the conflict between the generations in lines 15–40.",
    modelAnswer: "Operator: examine (detailed analysis of how). Plan: 1) Introduce the conflict and its participants (l. 15–20). 2) Analyse the narrative perspective and dialogue that create the tension, with evidence. 3) Explain the effect on the reader / what it reveals; no personal opinion, no summary of the whole text.",
    checklist: ["Operator identified correctly", "Only lines 15–40", "Focus on HOW (presentation), not just WHAT"],
  },
  unclear_strong_ideas: {
    skill: "unclear_strong_ideas", kind: "rewrite",
    instruction: "The idea is good but hidden. Rewrite it as a clear topic sentence followed by one explaining sentence.",
    material: "Social media is like a mirror but not really because it shows what people want and that is a problem for teenagers, kind of.",
    modelAnswer: "Social media works like a distorting mirror: it reflects not reality but what users want others to see. For teenagers, constant comparison with these edited images can damage their self-esteem.",
    checklist: ["Clear claim first", "The metaphor is made precise", "Explains the consequence"],
  },
  device_spotting_without_effect: {
    skill: "device_spotting_without_effect", kind: "rewrite",
    instruction: "Add the effect and its function to the device.",
    material: "In line 7 there is an anaphora: “We can wait. We can hope. We can pretend.”",
    modelAnswer: "The anaphora “We can wait. We can hope. We can pretend.” (l. 7) builds a rhythm of passive options, which makes inaction sound increasingly absurd and prepares the call to act.",
    checklist: ["Device named and quoted", "Effect on the reader", "Function for the speaker's purpose"],
  },
  summary_includes_opinion: {
    skill: "summary_includes_opinion", kind: "rewrite",
    instruction: "Remove opinion, quotation and detail so that this becomes a neutral summary sentence.",
    material: "The author rightly criticises, in his brilliant article, that “far too many young people” waste hours on their phones, for example 7 hours a day.",
    modelAnswer: "The author criticises the amount of time young people spend on their smartphones.",
    checklist: ["No evaluation (rightly, brilliant)", "No direct quotation", "No unnecessary numbers or examples"],
  },
  mediation_too_literal: {
    skill: "mediation_too_literal", kind: "short_paragraph",
    instruction: "Mediate for an exchange student who wants to know whether they may use their phone at the school: select only what matters for them, in your own words.",
    material: "Seit Beginn des Schuljahres gilt ein striktes Handyverbot: Von der ersten bis zur letzten Stunde bleiben Smartphones ausgeschaltet. Wer erwischt wird, muss das Gerät bis Schulschluss abgeben. Ausnahmen gibt es nur mit Genehmigung der Schulleitung.",
    modelAnswer: "Phones are banned for the whole school day – they have to stay switched off from the first to the last lesson. If a teacher catches you using yours, it is taken away until the end of the day. You can only get an exception from the head teacher.",
    checklist: ["Addressee's question answered", "Not a word-for-word translation", "Appropriate register"],
  },
  register_slips: {
    skill: "register_slips", kind: "rewrite",
    instruction: "Rewrite in a formal register suitable for a comment.",
    material: "Honestly, it's kind of crazy that loads of kids don't get enough sleep, and schools should totally start later.",
    modelAnswer: "It is alarming that a large number of teenagers do not get enough sleep; schools should therefore consider starting later.",
    checklist: ["No contractions", "No colloquialisms (kind of, loads, totally)", "Still natural, not over-ornate"],
  },
  spelling_punctuation: {
    skill: "spelling_punctuation", kind: "rewrite",
    instruction: "Correct spelling and punctuation.",
    material: "The goverment argues, that it's new policy is neccessary however critics disagree.",
    modelAnswer: "The government argues that its new policy is necessary; however, critics disagree.",
    checklist: ["government, necessary", "No comma before “that”", "its vs it's", "Semicolon/full stop before “however”"],
  },
  paragraph_structure: {
    skill: "paragraph_structure", kind: "short_paragraph",
    instruction: "Write one argumentative paragraph (5–6 sentences): topic sentence, explanation, example, and a sentence linking back to the thesis.",
    material: "Thesis: Public transport should be free in cities.",
    modelAnswer: null,
    checklist: ["Topic sentence states one argument", "Explanation of why", "Concrete example", "Link back to the thesis"],
  },
  word_count_control: {
    skill: "word_count_control", kind: "plan",
    instruction: "Plan a 300-word comment: assign a word budget to the introduction, each body paragraph and the conclusion.",
    material: "Statement: “Tourism does more harm than good.”",
    modelAnswer: "Introduction ~40 words; argument 1 ~80; argument 2 ~80; counterargument + rebuttal ~60; conclusion ~40 (total 300).",
    checklist: ["Budgets add up to the target", "Most words for the arguments", "Short introduction and conclusion"],
  },
};
