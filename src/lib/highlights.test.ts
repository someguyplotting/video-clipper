import { describe, expect, it } from "vitest";
import { selectHighlights, validTrim, wordsBetween } from "./highlights";

const words = Array.from({ length: 80 }, (_, i) => ({ w: `w${i}`, s: i * 0.5, e: i * 0.5 + 0.4 }));

describe("selectHighlights", () => {
  it("keeps clips inside the range and band, best first", () => {
    const result = selectHighlights(
      [
        { title: "B", start: 12, end: 24, score: 70, reason: "" },
        { title: "A", start: 1, end: 12, score: 93, reason: "" },
        { title: "Long", start: 0, end: 39, score: 99, reason: "" },
        { title: "Outside", start: 50, end: 60, score: 99, reason: "" },
      ],
      { start: 0, end: 40 },
      "short",
      words,
    );
    expect(result.map((h) => h.title)).toEqual(["A", "B"]);
    for (const h of result) {
      expect(h.start).toBeGreaterThanOrEqual(0);
      expect(h.end).toBeLessThanOrEqual(40);
      expect(h.end - h.start).toBeLessThan(30);
    }
  });

  it("clamps to the range and clamps scores", () => {
    const [h] = selectHighlights([{ title: "", start: 30, end: 45, score: 140 }], { start: 0, end: 40 }, "short", words);
    expect(h).toMatchObject({ title: "Untitled clip", end: 40, score: 100 });
  });

  it("ignores junk", () => {
    expect(selectHighlights("nope", { start: 0, end: 40 }, "auto", words)).toEqual([]);
  });
});

describe("helpers", () => {
  it("slices words and checks trims", () => {
    expect(wordsBetween(words, 1, 2).map((w) => w.w)).toEqual(["w2", "w3"]);
    expect(validTrim(0, 10, 40)).toBe(true);
    expect(validTrim(5, 5.5, 40)).toBe(false);
    expect(validTrim(0, 41, 40)).toBe(false);
  });
});
