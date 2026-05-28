import { describe, it, expect } from "vitest";
import {
  buildAdvancedPattern,
  type AdvancedMatchType,
} from "../../../src/services/plantLibrarySearch/advanced";
import {
  SEARCH_METHODS,
  DEFAULT_METHOD_ID,
} from "../../../src/services/plantLibrarySearch";

describe("plantLibrarySearch — registry shape", () => {
  it("registers the search methods (4 DB-backed + AI)", () => {
    expect(SEARCH_METHODS).toHaveLength(5);
  });

  it("includes the AI search method", () => {
    expect(SEARCH_METHODS.find((m) => m.id === "ai")).toBeDefined();
  });

  it("every method has a unique id", () => {
    const ids = SEARCH_METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every method has a label, description, defaultOptions and run", () => {
    for (const m of SEARCH_METHODS) {
      expect(m.label).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.defaultOptions).toBeDefined();
      expect(typeof m.run).toBe("function");
    }
  });

  it("default method id resolves to a registered method", () => {
    expect(SEARCH_METHODS.find((m) => m.id === DEFAULT_METHOD_ID)).toBeDefined();
  });
});

describe("buildAdvancedPattern", () => {
  it("wraps with leading wildcard for 'startsWith'", () => {
    expect(buildAdvancedPattern("lav", "startsWith")).toBe("lav%");
  });

  it("wraps with trailing wildcard for 'endsWith'", () => {
    expect(buildAdvancedPattern("ender", "endsWith")).toBe("%ender");
  });

  it("wraps both sides for 'contains'", () => {
    expect(buildAdvancedPattern("aven", "contains")).toBe("%aven%");
  });

  it("escapes ILIKE wildcards in user input", () => {
    expect(buildAdvancedPattern("50%_off", "contains")).toBe("%50\\%\\_off%");
    expect(buildAdvancedPattern("a_b", "startsWith")).toBe("a\\_b%");
    expect(buildAdvancedPattern("c%d", "endsWith")).toBe("%c\\%d");
  });

  it("handles empty input deterministically", () => {
    expect(buildAdvancedPattern("", "startsWith")).toBe("%");
    expect(buildAdvancedPattern("", "endsWith")).toBe("%");
    expect(buildAdvancedPattern("", "contains")).toBe("%%");
  });

  it("preserves case (caller is responsible for lowercasing)", () => {
    expect(buildAdvancedPattern("Lavender", "contains")).toBe("%Lavender%");
  });

  it("covers all match types in the union", () => {
    const all: AdvancedMatchType[] = ["startsWith", "endsWith", "contains"];
    for (const m of all) {
      expect(buildAdvancedPattern("x", m)).toContain("x");
    }
  });
});
