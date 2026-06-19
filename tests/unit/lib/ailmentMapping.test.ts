import { describe, it, expect } from "vitest";
import {
  kindToWatchlistType, severityToWatchlist, mapLibraryToWatchlistPayload, filterAilmentLibrary,
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
    expect(p.source).toBe("ai");
    expect(p.affected_plants).toEqual(["tomato", "potato"]);
    expect(p.thumbnail_url).toBe("http://x/y.jpg");
    expect(p.symptoms).toHaveLength(2);
    expect(p.symptoms[0]).toMatchObject({ title: "brown lesions", severity: "severe" });
    expect(p.remedy_steps[0]).toMatchObject({ title: "Treatment", description: base.treatment });
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
