import { describe, it, expect } from "vitest";
import { DATA_SOURCES, SOURCE_CATEGORIES } from "../../../src/constants/dataSources";

describe("DATA_SOURCES (Credits & Sources page)", () => {
  it("every source has the required fields", () => {
    for (const s of DATA_SOURCES) {
      expect(s.id, `id for ${s.name}`).toBeTruthy();
      expect(s.name, `name for ${s.id}`).toBeTruthy();
      expect(s.provides, `provides for ${s.id}`).toBeTruthy();
      expect(s.note, `note for ${s.id}`).toBeTruthy();
      expect(s.tint, `tint for ${s.id}`).toBeTruthy();
      expect(Array.isArray(s.usedIn) && s.usedIn.length > 0, `usedIn for ${s.id}`).toBe(true);
    }
  });

  it("every source's category is one of the known categories", () => {
    for (const s of DATA_SOURCES) {
      expect(SOURCE_CATEGORIES, `category for ${s.id}`).toContain(s.category);
    }
  });

  it("source ids are unique", () => {
    const ids = DATA_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category has at least one source", () => {
    for (const c of SOURCE_CATEGORIES) {
      expect(DATA_SOURCES.some((s) => s.category === c), `category ${c} has no source`).toBe(true);
    }
  });

  it("covers the key external sources the user asked to credit", () => {
    const ids = new Set(DATA_SOURCES.map((s) => s.id));
    for (const id of ["perenual", "verdantly", "gbif", "wikidata", "wikipedia", "inaturalist", "plantnet", "open_meteo", "gemini", "ai", "pixabay", "unsplash", "firebase", "resend", "stripe", "supabase"]) {
      expect(ids.has(id), `missing source: ${id}`).toBe(true);
    }
  });
});
