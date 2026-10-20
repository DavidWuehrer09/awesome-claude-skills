import { describe, expect, it } from "vitest";
import { languageOf, parseVocabularyText } from "@/domain/vocab/parse";

describe("parseVocabularyText", () => {
  it("parses dash-separated English definitions", () => {
    const r = parseVocabularyText(`to undermine — to weaken gradually
compelling — convincing and persuasive
to exacerbate — to make a problem worse
at odds with — in conflict with
to shed light on — to clarify or explain`);
    expect(r.candidates).toHaveLength(5);
    expect(r.candidates[0]).toMatchObject({ headword: "to undermine", definitionEn: "to weaken gradually", partOfSpeech: "verb" });
    expect(r.candidates[3].headword).toBe("at odds with");
    expect(r.candidates.every((c) => c.uncertain.length === 0)).toBe(true);
  });

  it("recognises German translations and colon separators", () => {
    const r = parseVocabularyText("to undermine: untergraben\ncompelling: überzeugend\nthreat — die Bedrohung");
    expect(r.candidates.map((c) => c.translationDe)).toEqual(["untergraben", "überzeugend", "die Bedrohung"]);
  });

  it("keeps headings as suggested topics and bullets/numbering", () => {
    const r = parseVocabularyText(`Politics and Democracy:
1. to undermine – to weaken gradually
2. turnout – the number of people who vote

ENVIRONMENT
• to mitigate – to make less severe`);
    expect(r.headings).toEqual(["Politics and Democracy", "ENVIRONMENT"]);
    expect(r.candidates[1]).toMatchObject({ headword: "turnout", heading: "Politics and Democracy" });
    expect(r.candidates[2]).toMatchObject({ headword: "to mitigate", heading: "ENVIRONMENT" });
  });

  it("parses TSV and CSV with header rows", () => {
    const tsv = parseVocabularyText("word\tgerman\texample\nto erode\tuntergraben, aushöhlen\tTrust has been eroded.\nbias\tdie Voreingenommenheit\t");
    expect(tsv.format).toBe("table");
    expect(tsv.candidates[0]).toMatchObject({ headword: "to erode", translationDe: "untergraben, aushöhlen", example: "Trust has been eroded." });
    const csv = parseVocabularyText('term,definition\n"far-reaching","having wide effects, often important"\nscrutiny,close examination');
    expect(csv.candidates).toHaveLength(2);
    expect(csv.candidates[0].definitionEn).toBe("having wide effects, often important");
  });

  it("captures examples, synonyms and antonyms", () => {
    const r = parseVocabularyText(`to exacerbate — to make worse (syn: aggravate, worsen) (ant: alleviate)
  e.g. The drought exacerbated the crisis.`);
    const c = r.candidates[0];
    expect(c.synonyms).toEqual(["aggravate", "worsen"]);
    expect(c.antonyms).toEqual(["alleviate"]);
    expect(c.example).toBe("The drought exacerbated the crisis.");
  });

  it("flags instead of dropping ambiguous or malformed lines", () => {
    const r = parseVocabularyText("ubiquitous\nto under�ine — weaken\nsalient — prominent");
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates[0].uncertain).toContain("No meaning found");
    expect(r.candidates[1].uncertain.join()).toMatch(/unreadable/);
  });

  it("handles fully indented lists without merging lines", () => {
    const r = parseVocabularyText("   - to undermine – untergraben\n   - to bolster – stärken");
    expect(r.candidates).toHaveLength(2);
  });

  it("does not split hyphenated words", () => {
    const r = parseVocabularyText("far-reaching implications — weitreichende Folgen");
    expect(r.candidates[0].headword).toBe("far-reaching implications");
  });

  it("detects language", () => {
    expect(languageOf("die Bedrohung")).toBe(1);
    expect(languageOf("to make a problem worse")).toBe(-1);
  });
});
