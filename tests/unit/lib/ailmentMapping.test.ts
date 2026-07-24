import { describe, it, expect } from "vitest";
import {
  kindToWatchlistType, severityToWatchlist, mapLibraryToWatchlistPayload, filterAilmentLibrary,
  libraryRowToFavouriteInput, splitStepsText,
  type LibraryAilment,
} from "../../../src/services/ailmentLibraryService";

const base: LibraryAilment = {
  id: 1, name: "Late Blight", kind: "disease", scientific_name: "Phytophthora infestans",
  aliases: [], description: "A destructive fungal-like disease.", symptoms: ["brown lesions", "white mould"],
  causes: "Cool wet weather", treatment: "Remove infected foliage; copper fungicide.", prevention: "Space plants; water at base.",
  severity: "critical", affected_plant_types: ["tomato", "potato"], affected_families: ["Solanaceae"],
  season: ["humid weather"], organic_friendly: true, image_url: null, thumbnail_url: "http://x/y.jpg",
};

describe("kindToWatchlistType", () => {
  it("maps kinds (disorder + disease → disease)", () => {
    expect(kindToWatchlistType("pest")).toBe("pest");
    expect(kindToWatchlistType("invasive")).toBe("invasive_plant");
    expect(kindToWatchlistType("disease")).toBe("disease");
    expect(kindToWatchlistType("disorder")).toBe("disease");
  });
});

describe("severityToWatchlist", () => {
  it("collapses 4 levels into 3", () => {
    expect(severityToWatchlist("critical")).toBe("severe");
    expect(severityToWatchlist("high")).toBe("severe");
    expect(severityToWatchlist("moderate")).toBe("moderate");
    expect(severityToWatchlist("low")).toBe("mild");
    expect(severityToWatchlist(null)).toBe("moderate");
  });
});

describe("mapLibraryToWatchlistPayload", () => {
  it("maps scalars, symptoms, steps", () => {
    const p = mapLibraryToWatchlistPayload(base, "home-1");
    expect(p.home_id).toBe("home-1");
    expect(p.name).toBe("Late Blight");
    expect(p.type).toBe("disease");
    expect(p.source).toBe("library"); // library adds are a first-class source, not 'ai'
    expect(p.affected_plants).toEqual(["tomato", "potato"]);
    expect(p.thumbnail_url).toBe("http://x/y.jpg");
    expect(p.symptoms).toHaveLength(2);
    expect(p.symptoms[0]).toMatchObject({ title: "brown lesions", severity: "severe" });
    // #11 — a "a; b" blob splits into discrete steps so the count reads correctly.
    expect(p.remedy_steps).toHaveLength(2);
    expect(p.remedy_steps[0]).toMatchObject({ title: "Treatment", description: "Remove infected foliage", step_order: 0 });
    expect(p.remedy_steps[1]).toMatchObject({ title: "Treatment", description: "copper fungicide.", step_order: 1 });
    expect(p.prevention_steps).toHaveLength(2);
    expect(p.prevention_steps[0]).toMatchObject({ title: "Prevention", task_type: "inspect" });
  });

  it("omits steps when treatment/prevention absent + falls back to image_url", () => {
    const p = mapLibraryToWatchlistPayload(
      { ...base, treatment: null, prevention: null, thumbnail_url: null, image_url: "http://img" },
      "h",
    );
    expect(p.remedy_steps).toEqual([]);
    expect(p.prevention_steps).toEqual([]);
    expect(p.thumbnail_url).toBe("http://img");
  });
});

describe("filterAilmentLibrary", () => {
  const rows: LibraryAilment[] = [
    base,
    { ...base, id: 2, name: "Aphids", scientific_name: "Aphidoidea", aliases: ["greenfly", "blackfly"] },
    { ...base, id: 3, name: "Powdery Mildew", scientific_name: "Erysiphales", aliases: [] },
  ];

  it("returns [] for an empty query", () => {
    expect(filterAilmentLibrary(rows, "  ")).toEqual([]);
  });
  it("matches on name (case-insensitive)", () => {
    expect(filterAilmentLibrary(rows, "blight").map((r) => r.id)).toEqual([1]);
  });
  it("matches on scientific name", () => {
    expect(filterAilmentLibrary(rows, "erysiph").map((r) => r.id)).toEqual([3]);
  });
  it("matches on an alias", () => {
    expect(filterAilmentLibrary(rows, "greenfly").map((r) => r.id)).toEqual([2]);
  });
  it("returns [] when nothing matches", () => {
    expect(filterAilmentLibrary(rows, "zzz")).toEqual([]);
  });
});

describe("libraryRowToFavouriteInput (Stage 1 — favourite from the library)", () => {
  it("shapes a library row into the favouriteAilment input, source always 'library'", () => {
    const input = libraryRowToFavouriteInput(base);
    expect(input.id).toBe("1");
    expect(input.name).toBe("Late Blight");
    expect(input.type).toBe("disease"); // via kindToWatchlistType
    expect(input.source).toBe("library"); // tier-open on every plan
    expect(input.thumbnail_url).toBe("http://x/y.jpg");
    expect(input.scientific_name).toBe("Phytophthora infestans");
    expect(input.affected_plants).toEqual(["tomato", "potato"]);
    expect(input.prevention_steps).toEqual([
      { title: "Prevention", description: "Space plants" },
      { title: "Prevention", description: "water at base." },
    ]);
    expect(input.remedy_steps).toEqual([
      { title: "Treatment", description: "Remove infected foliage" },
      { title: "Treatment", description: "copper fungicide." },
    ]);
    expect(input.perenual_id).toBeNull();
  });

  it("falls back to image_url for the thumbnail and empty steps when treatment/prevention are null", () => {
    const input = libraryRowToFavouriteInput({
      ...base, thumbnail_url: null, image_url: "http://x/full.jpg", treatment: null, prevention: null, kind: "invasive",
    });
    expect(input.thumbnail_url).toBe("http://x/full.jpg");
    expect(input.type).toBe("invasive_plant");
    expect(input.prevention_steps).toEqual([]);
    expect(input.remedy_steps).toEqual([]);
  });
});

describe("splitStepsText (#11 — text blob → discrete steps)", () => {
  it("splits a newline-joined blob (the persisted shape) into every step", () => {
    const text = "Squash colonies by hand\nSpray with insecticidal soap\nIntroduce ladybirds\nRemove infested shoots\nHose off with water\nEncourage lacewings";
    const steps = splitStepsText(text);
    expect(steps).toHaveLength(6);
    expect(steps[0]).toBe("Squash colonies by hand");
  });
  it("splits a single blob on numbered / semicolon markers", () => {
    expect(splitStepsText("1. Prune out. 2) Feed. 3. Mulch.")).toEqual(["Prune out.", "Feed.", "Mulch."]);
    expect(splitStepsText("Water deeply; mulch well; feed monthly")).toEqual(["Water deeply", "mulch well", "feed monthly"]);
  });
  it("strips leading list markers", () => {
    expect(splitStepsText("- Remove leaves\n- Copper spray")).toEqual(["Remove leaves", "Copper spray"]);
  });
  it("returns [] for empty / null / whitespace", () => {
    expect(splitStepsText(null)).toEqual([]);
    expect(splitStepsText("")).toEqual([]);
    expect(splitStepsText("   ")).toEqual([]);
  });
  it("keeps genuine prose as a single step", () => {
    expect(splitStepsText("Keep the soil moist and watch for signs of stress.")).toEqual([
      "Keep the soil moist and watch for signs of stress.",
    ]);
  });
});
