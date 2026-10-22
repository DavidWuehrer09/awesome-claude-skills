import { describe, expect, it } from "vitest";
import { containsQuote, extractQuotedStrings, wordCount } from "@/lib/text/normalize";
import { segmentEssay, splitSentences, sentencesToText } from "@/lib/text/segment";
import { diffWords, diffStats } from "@/lib/text/diff";

describe("containsQuote", () => {
  const essay = "The author calls them “a generation betrayed” (l. 12). This shows his anger.";
  it("matches despite typographic quotes, case and whitespace", () => {
    expect(containsQuote(essay, '"A generation   betrayed"')).toBe(true);
  });
  it("supports ellipses between fragments in order", () => {
    expect(containsQuote(essay, "The author calls … his anger")).toBe(true);
    expect(containsQuote(essay, "his anger ... The author")).toBe(false);
  });
  it("rejects invented quotes", () => {
    expect(containsQuote(essay, "a lost generation")).toBe(false);
    expect(containsQuote(essay, "")).toBe(false);
  });
});

describe("segmentation", () => {
  it("does not split at abbreviations, line references or initials", () => {
    const s = splitSentences("In l. 12 the author, e.g. Mr. J. Smith, argues this. Then he stops! Why? Because 2 reasons exist.");
    expect(s).toEqual(["In l. 12 the author, e.g. Mr. J. Smith, argues this.", "Then he stops!", "Why?", "Because 2 reasons exist."]);
  });
  it("handles quotations ending a sentence", () => {
    expect(splitSentences('He writes "we failed." The reader agrees.')).toEqual(['He writes "we failed."', "The reader agrees."]);
  });
  it("assigns paragraph-scoped ids and round-trips text", () => {
    const text = "First one. Second one.\n\nNew paragraph here.";
    const sents = segmentEssay(text);
    expect(sents.map((s) => s.id)).toEqual(["p1s1", "p1s2", "p2s1"]);
    expect(sentencesToText(sents)).toBe(text);
  });
});

describe("diffWords", () => {
  it("classifies retained, modified, added and removed words", () => {
    const ops = diffWords("The author uses many devices to make it interesting.", "The author deploys several devices to make the issue urgent and personal.");
    expect(ops[0]).toEqual({ type: "retained", text: "The author" });
    expect(ops.some((o) => o.type === "modified")).toBe(true);
    const st = diffStats(ops);
    expect(st.retained).toBeGreaterThan(0);
  });
  it("pure additions and removals", () => {
    expect(diffWords("A B", "A B C")).toEqual([{ type: "retained", text: "A B" }, { type: "added", text: "C" }]);
    expect(diffWords("A B C", "A C")).toEqual([{ type: "retained", text: "A" }, { type: "removed", text: "B" }, { type: "retained", text: "C" }]);
    expect(diffWords("Same text.", "Same text.")).toEqual([{ type: "retained", text: "Same text." }]);
  });
});

describe("helpers", () => {
  it("counts words including contractions and hyphenation", () => {
    expect(wordCount("It's a well-known fact, isn't it?")).toBe(6);
  });
  it("extracts quoted strings", () => {
    expect(extractQuotedStrings('He calls them “a generation betrayed” and "lost".')).toEqual(["a generation betrayed", "lost"]);
  });
});
