import { describe, expect, it } from "vitest";
import { inflectionPattern, levenshtein, normalizeHeadword, wordCount } from "@/lib/text";
import { endOfLocalDay, inWindow, localDateString, parseHHMM, startOfLocalDay, zonedTimeToUtc } from "@/lib/time";

describe("text", () => {
  it("computes edit distance with transpositions", () => {
    expect(levenshtein("undermine", "undermien")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("normalises headwords", () => {
    expect(normalizeHeadword("  To   Undermine. ")).toBe("undermine");
    expect(normalizeHeadword("“far-reaching”")).toBe("far-reaching");
  });
  it("matches inflected forms in text", () => {
    expect(inflectionPattern("to undermine")!.test("It has undermined trust")).toBe(true);
    expect(inflectionPattern("shed light on sth")!.test("This sheds light on the issue")).toBe(true);
    expect(wordCount("It's a well-known fact.")).toBe(4);
  });
});

describe("time zones", () => {
  const tz = "Europe/Berlin";
  it("computes local day boundaries in winter and summer", () => {
    const winter = new Date("2026-01-15T22:30:00Z"); // 23:30 in Berlin
    expect(localDateString(winter, tz)).toBe("2026-01-15");
    expect(endOfLocalDay(winter, tz).toISOString()).toBe("2026-01-15T23:00:00.000Z");
    const summer = new Date("2026-07-15T22:30:00Z"); // 00:30 next day in Berlin
    expect(localDateString(summer, tz)).toBe("2026-07-16");
    expect(startOfLocalDay(summer, tz).toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });
  it("handles DST transition days (23 h and 25 h days)", () => {
    const spring = new Date("2026-03-29T10:00:00Z");
    expect(endOfLocalDay(spring, tz).getTime() - startOfLocalDay(spring, tz).getTime()).toBe(23 * 3600000);
    const autumn = new Date("2026-10-25T10:00:00Z");
    expect(endOfLocalDay(autumn, tz).getTime() - startOfLocalDay(autumn, tz).getTime()).toBe(25 * 3600000);
    expect(zonedTimeToUtc(2026, 3, 29, 17, 30, tz).toISOString()).toBe("2026-03-29T15:30:00.000Z");
  });
  it("evaluates overnight windows", () => {
    expect(inWindow(parseHHMM("23:00"), parseHHMM("21:30"), parseHHMM("07:30"))).toBe(true);
    expect(inWindow(parseHHMM("12:00"), parseHHMM("21:30"), parseHHMM("07:30"))).toBe(false);
    expect(() => parseHHMM("25:00")).toThrow();
  });
});
