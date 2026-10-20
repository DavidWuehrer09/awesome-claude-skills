/**
 * Offline topic suggestions from a small keyword lexicon. Used when AI is
 * disabled or unavailable; the AI classifier (when configured) refines them.
 * Suggestions are only proposals: the learner confirms or edits every one.
 */
export type TopicSuggestion = { topic: string; subtopic?: string; score: number };

const LEXICON: { topic: string; subtopic: string; words: string[] }[] = [
  { topic: "Politics and Democracy", subtopic: "Elections and Representation", words: ["elect", "vote", "turnout", "ballot", "campaign", "constituen", "represent", "referendum", "poll", "candidate", "wahl"] },
  { topic: "Politics and Democracy", subtopic: "Government and Institutions", words: ["govern", "parliament", "legislat", "executive", "judiciary", "policy", "law", "constitution", "regulat", "institution", "minister", "sovereign", "regierung"] },
  { topic: "Politics and Democracy", subtopic: "Ideologies and Rights", words: ["ideolog", "liberal", "conservat", "populis", "authoritar", "liberty", "freedom", "rights", "civil", "democra", "totalitar", "censor", "protest"] },
  { topic: "Society and Identity", subtopic: "Social Inequality", words: ["inequal", "poverty", "privilege", "wealth", "marginal", "disadvantag", "welfare", "deprivation", "gap", "armut"] },
  { topic: "Society and Identity", subtopic: "Discrimination", words: ["discriminat", "racis", "prejudic", "bias", "stereotyp", "segregat", "xenophob", "sexis", "vorurteil"] },
  { topic: "Society and Identity", subtopic: "Belonging and Identity", words: ["identit", "belong", "heritage", "migra", "diaspora", "assimilat", "integrat", "multicultur", "ethnic", "minority"] },
  { topic: "Media and Technology", subtopic: "Artificial Intelligence", words: ["artificial", "algorithm", "automat", "machine", "robot", "ai ", "data", "digital", "computer"] },
  { topic: "Media and Technology", subtopic: "Journalism and Misinformation", words: ["journalis", "misinform", "disinform", "propaganda", "fake", "news", "press", "media", "source", "fact", "headline"] },
  { topic: "Media and Technology", subtopic: "Social Media and Privacy", words: ["social media", "privacy", "surveil", "online", "platform", "influencer", "post", "share", "follower", "screen"] },
  { topic: "Environment", subtopic: "Climate Change", words: ["climate", "emission", "carbon", "warming", "greenhouse", "fossil", "drought", "flood", "mitigat", "klima"] },
  { topic: "Environment", subtopic: "Sustainability and Energy", words: ["sustainab", "renewable", "energy", "recycl", "resource", "conserv", "pollut", "waste", "biodivers", "ecosystem", "species", "nachhalt"] },
  { topic: "Literature and Film", subtopic: "Characterisation and Narrative", words: ["character", "narrat", "protagonist", "antagonist", "perspective", "plot", "point of view", "omniscient", "flashback", "setting"] },
  { topic: "Literature and Film", subtopic: "Stylistic Devices", words: ["metaphor", "simile", "irony", "symbol", "imagery", "alliteration", "anaphora", "rhetorical", "hyperbole", "tone", "connotat", "personif"] },
  { topic: "Academic Writing", subtopic: "Argumentation and Evaluation", words: ["argu", "claim", "evidence", "assert", "contend", "evaluat", "assess", "convinc", "compelling", "persuasive", "valid", "undermine", "reinforce", "substantiate"] },
  { topic: "Academic Writing", subtopic: "Contrast, Concession and Causation", words: ["whereas", "nevertheless", "albeit", "concede", "admittedly", "consequen", "result in", "give rise", "lead to", "owing to", "hence", "thus", "conversely"] },
  { topic: "Economy and Work", subtopic: "Globalisation and Work", words: ["global", "trade", "econom", "market", "labour", "employ", "wage", "outsourc", "industry", "consum", "profit"] },
  { topic: "Education", subtopic: "School and Learning", words: ["educat", "school", "curricul", "pupil", "student", "teacher", "learn", "academic", "university", "bildung"] },
  { topic: "Ethics and Science", subtopic: "Science and Progress", words: ["ethic", "moral", "scien", "research", "genetic", "progress", "innovat", "experiment", "responsib", "dilemma"] },
];

export function suggestTopic(text: string): TopicSuggestion | null {
  const t = ` ${text.toLowerCase()} `;
  let best: TopicSuggestion | null = null;
  for (const group of LEXICON) {
    const score = group.words.reduce((acc, w) => acc + (t.includes(w) ? (w.length > 5 ? 2 : 1) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { topic: group.topic, subtopic: group.subtopic, score };
  }
  return best;
}

/** Group candidates by suggested topic so the review screen can show proposals. */
export function proposeGroups(items: { key: string; text: string; heading?: string }[]) {
  const groups = new Map<string, { topic: string; subtopic?: string; keys: string[]; source: "heading" | "keywords" | "none" }>();
  for (const it of items) {
    let topic: string;
    let subtopic: string | undefined;
    let source: "heading" | "keywords" | "none";
    if (it.heading) {
      topic = it.heading;
      source = "heading";
    } else {
      const s = suggestTopic(it.text);
      topic = s?.topic ?? "Unsorted";
      subtopic = s?.subtopic;
      source = s ? "keywords" : "none";
    }
    const key = `${topic}::${subtopic ?? ""}`;
    const g = groups.get(key) ?? { topic, subtopic, keys: [], source };
    g.keys.push(it.key);
    groups.set(key, g);
  }
  return [...groups.values()];
}
