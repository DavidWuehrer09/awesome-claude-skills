/** Small, clearly labelled sample collection to explore the app before importing your own list. */
export type SampleWord = {
  topic: [string, string];
  headword: string;
  partOfSpeech: string;
  translationDe: string;
  definitionEn: string;
  cefr: "B2" | "C1" | "C2";
  register?: string;
  collocations: string[];
  synonyms: string[];
  antonyms?: string[];
  wordFamily?: { form: string; pos: string }[];
  confusables?: { word: string; distinction: string }[];
  examples: { text: string; kind: "natural" | "academic" }[];
  commonMistakes?: string[];
};

export const SAMPLE_WORDS: SampleWord[] = [
  {
    topic: ["Politics and Democracy", "Institutions and Trust"], headword: "to undermine", partOfSpeech: "verb", translationDe: "untergraben, schwächen", cefr: "C1",
    definitionEn: "to gradually weaken something, especially confidence, authority or a system", register: "neutral to formal",
    collocations: ["undermine confidence", "undermine trust in", "undermine the rule of law", "seriously undermine"],
    synonyms: ["weaken", "erode", "subvert"], antonyms: ["reinforce", "bolster"],
    wordFamily: [{ form: "undermining", pos: "noun" }],
    confusables: [
      { word: "erode", distinction: "slower and more gradual, often without a clear agent (trust erodes over years)" },
      { word: "subvert", distinction: "deliberate and hostile; aims to overturn a system from within" },
      { word: "weaken", distinction: "general and neutral; no sense of a hidden or gradual process" },
    ],
    examples: [
      { text: "Repeated scandals have undermined public trust in the government.", kind: "natural" },
      { text: "By dismissing expert advice, the minister undermines the very institutions she claims to defend.", kind: "academic" },
    ],
  },
  {
    topic: ["Politics and Democracy", "Institutions and Trust"], headword: "to bolster", partOfSpeech: "verb", translationDe: "stärken, untermauern", cefr: "C1",
    definitionEn: "to support or strengthen something, such as confidence, an argument or a position",
    collocations: ["bolster confidence", "bolster an argument", "bolster support for"], synonyms: ["strengthen", "reinforce", "boost"], antonyms: ["undermine"],
    examples: [
      { text: "The new evidence bolsters the case for reform.", kind: "academic" },
      { text: "The win bolstered the team's confidence.", kind: "natural" },
    ],
  },
  {
    topic: ["Politics and Democracy", "Elections and Participation"], headword: "turnout", partOfSpeech: "noun", translationDe: "Wahlbeteiligung", cefr: "B2",
    definitionEn: "the number or percentage of eligible people who vote in an election",
    collocations: ["high/low turnout", "voter turnout", "turnout among young people", "boost turnout"], synonyms: ["participation"],
    commonMistakes: ["*a big turnout* is possible but 'high turnout' is the standard collocation"],
    examples: [
      { text: "Turnout among first-time voters rose sharply.", kind: "natural" },
      { text: "Low turnout may weaken the legitimacy of the result.", kind: "academic" },
    ],
  },
  {
    topic: ["Politics and Democracy", "Elections and Participation"], headword: "disenfranchised", partOfSpeech: "adjective", translationDe: "entrechtet, ausgeschlossen", cefr: "C2",
    definitionEn: "deprived of the right to vote, or feeling excluded from political influence", register: "formal",
    collocations: ["feel disenfranchised", "disenfranchised voters", "politically disenfranchised"], synonyms: ["marginalised", "excluded"],
    wordFamily: [{ form: "disenfranchise", pos: "verb" }, { form: "disenfranchisement", pos: "noun" }],
    examples: [{ text: "Many young people feel disenfranchised by a political system that rarely addresses their concerns.", kind: "academic" }],
  },
  {
    topic: ["Environment", "Climate Change"], headword: "to mitigate", partOfSpeech: "verb", translationDe: "abmildern, verringern", cefr: "C1",
    definitionEn: "to make something bad less severe or harmful", register: "formal",
    collocations: ["mitigate the effects of", "mitigate risks", "mitigate climate change"], synonyms: ["alleviate", "reduce", "lessen"], antonyms: ["exacerbate", "aggravate"],
    wordFamily: [{ form: "mitigation", pos: "noun" }],
    confusables: [
      { word: "prevent", distinction: "stops something happening; mitigate only reduces its severity" },
      { word: "offset", distinction: "balances one effect with an opposite one (offset emissions)" },
      { word: "alleviate", distinction: "usually suffering, pain or symptoms rather than risks" },
    ],
    examples: [
      { text: "Planting trees can help mitigate the effects of urban heat.", kind: "natural" },
      { text: "Adaptation measures can mitigate, but not prevent, the consequences of rising sea levels.", kind: "academic" },
    ],
    commonMistakes: ["*mitigate against* is widely criticised; write 'mitigate the risk'"],
  },
  {
    topic: ["Environment", "Climate Change"], headword: "to exacerbate", partOfSpeech: "verb", translationDe: "verschärfen, verschlimmern", cefr: "C1",
    definitionEn: "to make a problem, bad situation or negative feeling worse", register: "formal",
    collocations: ["exacerbate tensions", "exacerbate the problem", "exacerbate inequality"], synonyms: ["aggravate", "worsen", "intensify"], antonyms: ["mitigate", "alleviate"],
    wordFamily: [{ form: "exacerbation", pos: "noun" }],
    confusables: [{ word: "aggravate", distinction: "similar meaning, but informally also means 'annoy', so exacerbate is clearer in formal writing" }],
    examples: [
      { text: "The drought exacerbated the food crisis.", kind: "natural" },
      { text: "Rather than solving the problem, the policy may exacerbate existing inequalities.", kind: "academic" },
    ],
  },
  {
    topic: ["Environment", "Sustainability"], headword: "far-reaching implications", partOfSpeech: "phrase", translationDe: "weitreichende Folgen", cefr: "C1",
    definitionEn: "consequences that affect many people or areas, often in the long term",
    collocations: ["have far-reaching implications for", "far-reaching consequences"], synonyms: ["wide-ranging consequences"],
    examples: [{ text: "The court's decision has far-reaching implications for climate policy.", kind: "academic" }],
  },
  {
    topic: ["Environment", "Sustainability"], headword: "to curb", partOfSpeech: "verb", translationDe: "eindämmen, begrenzen", cefr: "C1",
    definitionEn: "to control or limit something that is harmful", collocations: ["curb emissions", "curb spending", "curb the spread of"],
    synonyms: ["restrain", "limit", "rein in"], examples: [{ text: "The government introduced new taxes to curb carbon emissions.", kind: "natural" }],
  },
  {
    topic: ["Academic Writing", "Argumentation"], headword: "compelling", partOfSpeech: "adjective", translationDe: "überzeugend, zwingend", cefr: "C1",
    definitionEn: "convincing and persuasive; making you accept an argument", collocations: ["a compelling argument", "compelling evidence", "a compelling case for"],
    synonyms: ["convincing", "persuasive", "cogent"],
    confusables: [{ word: "cogent", distinction: "stresses logical clarity; more formal and less emotional than compelling" }],
    examples: [
      { text: "The author makes a compelling case for stricter regulation.", kind: "academic" },
      { text: "There is no compelling evidence that the policy works.", kind: "natural" },
    ],
  },
  {
    topic: ["Academic Writing", "Argumentation"], headword: "to concede", partOfSpeech: "verb", translationDe: "einräumen, zugeben", cefr: "C1",
    definitionEn: "to admit that something is true, often reluctantly, especially in an argument",
    collocations: ["concede that", "concede a point", "readily concede"], synonyms: ["acknowledge", "admit", "grant"],
    wordFamily: [{ form: "concession", pos: "noun" }],
    examples: [{ text: "Even critics concede that the reform has reduced waiting times.", kind: "academic" }],
  },
  {
    topic: ["Academic Writing", "Argumentation"], headword: "to shed light on", partOfSpeech: "phrase", translationDe: "Licht in etw. bringen, aufklären", cefr: "C1",
    definitionEn: "to make something clearer or easier to understand", collocations: ["shed new light on", "help shed light on"], synonyms: ["clarify", "illuminate", "elucidate"],
    examples: [{ text: "The diary sheds new light on the narrator's motives.", kind: "academic" }],
  },
  {
    topic: ["Academic Writing", "Contrast and Concession"], headword: "albeit", partOfSpeech: "conjunction", translationDe: "wenn auch, obgleich", cefr: "C2", register: "formal",
    definitionEn: "although; used before an adjective, adverb or phrase rather than a full clause",
    collocations: ["albeit briefly", "albeit with reservations", "albeit slowly"], synonyms: ["although", "though"],
    commonMistakes: ["normally followed by a phrase, not a full clause: 'albeit slowly', not *albeit it was slow*"],
    examples: [{ text: "The reform was successful, albeit at a considerable cost.", kind: "academic" }],
  },
];

export const SAMPLE_WRITING_KEY = "paragraph-local-elections";
