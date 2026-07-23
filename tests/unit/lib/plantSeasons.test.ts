import { describe, it, expect } from "vitest";
import { normaliseSeasons, normaliseMonths } from "../../../src/lib/plantSeasons";

describe("normaliseSeasons", () => {
  it("splits a comma-joined string into separate seasons", () => {
    // The AI-catalogue path stores "Spring, Summer, Autumn" as one joined string.
    expect(normaliseSeasons("Spring, Summer, Autumn")).toEqual(["Spring", "Summer", "Autumn"]);
  });

  it("splits a single-element array holding a joined string", () => {
    expect(normaliseSeasons(["spring,Summer,Autumn"])).toEqual(["Spring", "Summer", "Autumn"]);
  });

  it("maps American 'fall' to British 'Autumn'", () => {
    expect(normaliseSeasons(["Spring", "fall"])).toEqual(["Spring", "Autumn"]);
  });

  it("normalises casing to Title Case", () => {
    expect(normaliseSeasons(["SUMMER", "winter"])).toEqual(["Summer", "Winter"]);
  });

  it("orders canonical seasons Spring → Winter regardless of input order", () => {
    expect(normaliseSeasons(["Winter", "Autumn", "Spring", "Summer"])).toEqual([
      "Spring", "Summer", "Autumn", "Winter",
    ]);
  });

  it("dedupes case-insensitively, including fall/autumn collisions", () => {
    expect(normaliseSeasons(["autumn", "Fall", "AUTUMN"])).toEqual(["Autumn"]);
  });

  it("maps year-round synonyms", () => {
    expect(normaliseSeasons(["all year round"])).toEqual(["Year-round"]);
  });

  it("keeps an unrecognised token (title-cased) after the canonical ones", () => {
    expect(normaliseSeasons(["Summer", "monsoon"])).toEqual(["Summer", "Monsoon"]);
  });

  it("returns [] for null / undefined / empty", () => {
    expect(normaliseSeasons(null)).toEqual([]);
    expect(normaliseSeasons(undefined)).toEqual([]);
    expect(normaliseSeasons("")).toEqual([]);
    expect(normaliseSeasons([])).toEqual([]);
  });
});

describe("normaliseMonths", () => {
  it("splits a comma-joined string into separate months", () => {
    expect(normaliseMonths("Mar, Apr, May")).toEqual(["Mar", "Apr", "May"]);
  });

  it("maps full month names to 3-letter abbreviations", () => {
    expect(normaliseMonths(["January", "September"])).toEqual(["Jan", "Sep"]);
  });

  it("handles the 'Sept' variant", () => {
    expect(normaliseMonths(["Sept"])).toEqual(["Sep"]);
  });

  it("normalises casing", () => {
    expect(normaliseMonths(["mar", "APR"])).toEqual(["Mar", "Apr"]);
  });

  it("orders months Jan → Dec regardless of input order", () => {
    expect(normaliseMonths(["Dec", "Jan", "Jun"])).toEqual(["Jan", "Jun", "Dec"]);
  });

  it("dedupes", () => {
    expect(normaliseMonths(["Mar", "march", "MAR"])).toEqual(["Mar"]);
  });

  it("drops unrecognised tokens", () => {
    expect(normaliseMonths(["Mar", "notamonth", "Spring"])).toEqual(["Mar"]);
  });

  it("returns [] for null / undefined / empty", () => {
    expect(normaliseMonths(null)).toEqual([]);
    expect(normaliseMonths([])).toEqual([]);
  });
});
