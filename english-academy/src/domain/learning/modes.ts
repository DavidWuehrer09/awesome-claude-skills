/** The practice menu. Deterministic modes run offline from word data; AI modes generate fresh exercises. */
export type PracticeMode = {
  slug: string;
  title: string;
  description: string;
  href?: string; // deterministic modes link straight into a session
  ai?: "translation" | "error_correction" | "transformation" | "context_choice" | "cloze_contexts";
};

export const PRACTICE_MODES: PracticeMode[] = [
  { slug: "flashcards", title: "Smart Flashcards", description: "Adaptive card selection, flip and swipe, typed recall, scheduled review.", href: "/learn/session?mode=mixed" },
  { slug: "active-recall", title: "Active Recall", description: "See a definition, retrieve the word without options.", href: "/learn/session?mode=practice&kinds=typed_definition" },
  { slug: "reverse-recall", title: "Reverse Recall", description: "From German meaning to the English word, typed.", href: "/learn/session?mode=practice&kinds=typed_de_en" },
  { slug: "cloze", title: "Cloze Tests", description: "Fill the gap in your saved examples; add AI contexts for new sentences.", href: "/learn/session?mode=practice&kinds=cloze", ai: "cloze_contexts" },
  { slug: "collocation", title: "Collocation Trainer", description: "Which words naturally go together: pose a threat, draw a distinction…", href: "/learn/session?mode=practice&kinds=collocation" },
  { slug: "synonyms", title: "Synonyms & Antonyms", description: "Relationships, register and intensity of near-synonyms.", href: "/learn/session?mode=practice&kinds=synonym_choice,antonym_choice,nuance" },
  { slug: "word-families", title: "Word Families", description: "Verb, noun, adjective and adverb forms, including tricky spellings.", href: "/learn/session?mode=practice&kinds=word_family" },
  { slug: "sentences", title: "Sentence Construction", description: "Write an original sentence; get feedback on meaning, grammar, collocation and naturalness.", href: "/learn/session?mode=practice&kinds=production" },
  { slug: "transformation", title: "Sentence Transformation", description: "Rewrite a sentence with the target word without changing its meaning.", ai: "transformation" },
  { slug: "translation", title: "Translation Practice", description: "Translate natural German sentences; more than one good answer is accepted.", ai: "translation" },
  { slug: "error-correction", title: "Error Correction", description: "Find and fix vocabulary, collocation, register or grammar errors.", ai: "error_correction" },
  { slug: "context-choice", title: "Contextual Word Choice", description: "Which word best expresses the intended meaning in this paragraph?", ai: "context_choice" },
  { slug: "mixed", title: "Mixed Challenge", description: "All types combined and adaptive: two right in a row make the next exercise harder, a mistake makes it easier.", href: "/learn/session?mode=practice&adaptive=1" },
  { slug: "sprint", title: "Vocabulary Sprint", description: "60 seconds of quick retrieval. Just for fun: it doesn't change your schedule.", href: "/learn/session?mode=practice&kinds=meaning_choice,typed_de_en&timer=60&schedule=0&minutes=5" },
  { slug: "mastery-check", title: "Mastery Check", description: "Test one topic in every dimension and see what is genuinely secure.", href: "/learn" },
  { slug: "writing-transfer", title: "Writing Transfer", description: "Use selected words naturally in a paragraph, with feedback.", href: "/writing/new?section=vocab_context" },
  { slug: "en-de-meaning", title: "EN→DE meaning", description: "Read one of your example sentences and type what the word means in German.", href: "/learn/session?mode=practice&kinds=meaning_en_de" },
];

/** Deterministic modes run as a learn session and can be narrowed to one topic. */
export function sessionModeHref(m: PracticeMode, topicId: string | null): string | undefined {
  if (!m.href) return undefined;
  if (m.slug === "mastery-check") return topicId ? `/learn/session?check=1&topic=${topicId}` : m.href;
  if (!topicId || !m.href.startsWith("/learn/session")) return m.href;
  return `${m.href}&topic=${topicId}`;
}
