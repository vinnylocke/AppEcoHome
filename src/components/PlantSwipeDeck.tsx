import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getPlantWikiInfo } from "../lib/wikipedia";
import { Heart, X, Loader2, Sprout, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

const PERENUAL_API_KEY = import.meta.env.VITE_PERENUAL_API_KEY as string | undefined;

interface SwipePlant {
  id: string;
  name: string;
  scientific_name: string;
  tagline: string;
  tags: string[];
  image_query: string;
  source: "ai" | "perenual";
  thumbnail?: string | null;
}

interface Props {
  homeId: string;
  userId: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
}

function buildTagsFromPerenual(plant: any): string[] {
  const tags: string[] = [];
  const watering = (plant.watering || "").toLowerCase();
  if (watering === "minimum" || watering === "none") tags.push("drought-tolerant");
  if (watering === "frequent") tags.push("water-hungry");

  const sunlight: string[] = plant.sunlight || [];
  if (sunlight.some((s: string) => /full sun/i.test(s))) tags.push("full-sun");
  if (sunlight.some((s: string) => /partial shade/i.test(s))) tags.push("partial-shade");
  if (sunlight.some((s: string) => /full shade/i.test(s))) tags.push("full-shade");

  if (plant.cycle === "Perennial") tags.push("perennial");
  if (plant.cycle === "Annual") tags.push("annual");

  return tags;
}

// Fetch one random page from Perenual's species list — 1 API call per batch.
async function fetchPerenualBatch(
  seenNames: string[],
  count: number,
): Promise<SwipePlant[]> {
  if (!PERENUAL_API_KEY) {
    console.warn("[SwipeDeck] VITE_PERENUAL_API_KEY is not set");
    return [];
  }

  const page = Math.floor(Math.random() * 50) + 1;
  const url = `https://perenual.com/api/v2/species-list?key=${PERENUAL_API_KEY}&page=${page}`;

  const response = await fetch(url);
  const text = await response.text();
  console.log(`[SwipeDeck] Perenual page=${page} status=${response.status} bodyLen=${text.length} preview="${text.slice(0, 120)}"`);

  if (!response.ok) {
    throw new Error(`Perenual ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = JSON.parse(text);
  const raw: any[] = json.data || [];

  const seen = new Set(seenNames.map((n) => n.toLowerCase()));
  const results: SwipePlant[] = [];

  for (const p of raw) {
    if (results.length >= count) break;
    const name: string = p.common_name || (p.scientific_name || [])[0] || "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    results.push({
      id: crypto.randomUUID(),
      name,
      scientific_name: (p.scientific_name || [])[0] || "",
      tagline: `A ${(p.cycle || "").toLowerCase()} plant that needs ${(p.watering || "moderate").toLowerCase()} watering.`,
      tags: buildTagsFromPerenual(p),
      image_query: name,
      source: "perenual",
      thumbnail: p.default_image?.thumbnail || null,
    });
  }

  console.log(`[SwipeDeck] Perenual batch: ${results.length} plants from page ${page}`);
  return results;
}

async function fetchAIBatch(
  homeId: string,
  seenNames: string[],
  count: number,
): Promise<SwipePlant[]> {
  const { data, error } = await supabase.functions.invoke(
    "generate-swipe-plants",
    { body: { homeId, count, alreadySeenPlantNames: seenNames } },
  );
  if (error) throw error;
  return data?.plants || [];
}

async function enrichWithThumbnail(plant: SwipePlant): Promise<SwipePlant> {
  if (plant.thumbnail !== undefined) return plant;
  const wiki = await getPlantWikiInfo(plant.image_query || plant.name);
  return { ...plant, thumbnail: wiki?.thumbnail ?? null };
}

const TAG_COLOURS: Record<string, string> = {
  "drought-tolerant": "bg-amber-100 text-amber-700",
  "water-hungry": "bg-blue-100 text-blue-700",
  "full-sun": "bg-yellow-100 text-yellow-700",
  "partial-shade": "bg-sky-100 text-sky-700",
  "full-shade": "bg-slate-100 text-slate-600",
  "low-maintenance": "bg-emerald-100 text-emerald-700",
  "high-maintenance": "bg-red-100 text-red-700",
  "fragrant": "bg-purple-100 text-purple-700",
  "edible": "bg-green-100 text-green-700",
  "pollinator-friendly": "bg-orange-100 text-orange-700",
  "evergreen": "bg-teal-100 text-teal-700",
  "perennial": "bg-lime-100 text-lime-700",
  "annual": "bg-rose-100 text-rose-700",
};

function tagClass(tag: string) {
  return TAG_COLOURS[tag] ?? "bg-gray-100 text-gray-600";
}

export default function PlantSwipeDeck({
  homeId,
  userId,
  aiEnabled,
  perenualEnabled,
}: Props) {
  const [deck, setDeck] = useState<SwipePlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [swipeCount, setSwipeCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const seenNames = useRef<string[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      if (!aiEnabled && !perenualEnabled) {
        setFetchError("No plant data source is enabled for your account.");
        setLoading(false);
        return;
      }

      // When both sources are available, fetch 5 AI + 5 Perenual in parallel and interleave.
      // When only one is available, fetch 10 from that source.
      let plants: SwipePlant[];
      if (aiEnabled && perenualEnabled) {
        const [aiBatch, perenualBatch] = await Promise.allSettled([
          fetchAIBatch(homeId, seenNames.current, 5),
          fetchPerenualBatch(seenNames.current, 5),
        ]);
        const ai = aiBatch.status === "fulfilled" ? aiBatch.value : [];
        const perenual = perenualBatch.status === "fulfilled" ? perenualBatch.value : [];
        console.log(`[SwipeDeck] Both sources: AI=${ai.length}, Perenual=${perenual.length}`, {
          aiStatus: aiBatch.status,
          perenualStatus: perenualBatch.status,
          aiError: aiBatch.status === "rejected" ? aiBatch.reason : null,
          perenualError: perenualBatch.status === "rejected" ? perenualBatch.reason : null,
        });
        // Interleave: ai[0], perenual[0], ai[1], perenual[1], …
        plants = [];
        const maxLen = Math.max(ai.length, perenual.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < ai.length) plants.push(ai[i]);
          if (i < perenual.length) plants.push(perenual[i]);
        }
      } else if (aiEnabled) {
        plants = await fetchAIBatch(homeId, seenNames.current, 10);
      } else {
        plants = await fetchPerenualBatch(seenNames.current, 10);
      }

      for (const p of plants) seenNames.current.push(p.name);

      const enriched = await Promise.all(
        plants.map((p) => (p.source === "ai" ? enrichWithThumbnail(p) : p)),
      );

      setDeck(enriched);
    } catch (err: any) {
      setFetchError(err.message || "Failed to load plants.");
    } finally {
      setLoading(false);
    }
  }, [homeId, aiEnabled, perenualEnabled]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  // Auto-focus active card for screen reader accessibility
  useEffect(() => {
    if (cardRef.current && deck.length > 0) {
      cardRef.current.focus();
    }
  }, [deck]);

  // Keyboard shortcuts for swipe actions
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (deck.length === 0) return;

      // Dislike: ArrowLeft or 'a'/'A'
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleSwipe("negative");
      }
      // Like: ArrowRight or 'd'/'D'
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleSwipe("positive");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deck.length, handleSwipe]);

  async function savePref(plant: SwipePlant, sentiment: "positive" | "negative") {
    const { error } = await supabase.from("planner_preferences").insert({
      home_id: homeId,
      user_id: userId,
      entity_type: "plant",
      entity_name: plant.name,
      sentiment,
      reason: `Swipe: ${sentiment === "positive" ? "liked" : "disliked"} ${plant.name}`,
      source: "swipe",
    });
    if (error && error.code !== "23505") {
      console.error("Failed to save swipe preference:", error);
    }
  }

  const handleSwipe = useCallback(async (sentiment: "positive" | "negative") => {
    if (deck.length === 0) return;
    const [current, ...rest] = deck;
    setDeck(rest);
    setSwipeCount((c) => c + 1);

    // Announce swipe result for screen readers
    const action = sentiment === "positive" ? "Liked" : "Disliked";
    setAnnouncement(`${action} ${current.name}`);

    await savePref(current, sentiment);

    if (rest.length <= 2) {
      loadBatch();
    }
  }, [deck, loadBatch]);

  if (loading && deck.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 size={32} className="animate-spin text-rhozly-primary" />
        <p className="text-sm text-rhozly-on-surface/60">
          {aiEnabled ? "Personalising your plant deck…" : "Loading plants…"}
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-rhozly-on-surface/60 text-sm">{fetchError}</p>
        <button
          onClick={loadBatch}
          className="flex items-center gap-2 text-rhozly-primary font-semibold text-sm"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    );
  }

  if (deck.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Sprout size={28} className="text-emerald-600" />
        </div>
        <div>
          <p className="font-bold text-rhozly-on-surface">You've seen them all!</p>
          <p className="text-sm text-rhozly-on-surface/60 mt-1">
            {swipeCount} plants rated — great work.
          </p>
        </div>
        <button
          onClick={() => {
            seenNames.current = [];
            loadBatch();
          }}
          className="flex items-center gap-2 bg-rhozly-primary text-white font-bold px-6 py-3 rounded-full shadow-md hover:opacity-90 transition"
        >
          <RefreshCw size={14} />
          Start fresh
        </button>
      </div>
    );
  }

  const current = deck[0];
  const next = deck[1];

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Counter */}
      <p className="text-sm text-rhozly-on-surface/50 font-medium">
        {swipeCount} rated so far
      </p>

      {/* Card stack */}
      <div className="relative w-full max-w-sm" style={{ height: 440 }}>
        {/* Ghost card behind */}
        {next && (
          <div
            className="absolute inset-0 rounded-3xl bg-white border border-rhozly-outline/20 shadow-md"
            style={{ transform: "scale(0.95) translateY(8px)", zIndex: 0 }}
          />
        )}

        {/* Active card */}
        <div
          key={current.id}
          ref={cardRef}
          tabIndex={0}
          role="article"
          aria-label={`Plant card: ${current.name}, ${current.scientific_name}. ${current.tagline}`}
          className="absolute inset-0 rounded-3xl bg-white border border-rhozly-outline/20 shadow-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-rhozly-primary focus:ring-offset-2"
          style={{ zIndex: 1 }}
        >
          {/* Image */}
          <div className="relative h-64 bg-gradient-to-br from-emerald-50 to-green-100 flex items-center justify-center overflow-hidden">
            {current.thumbnail ? (
              <img
                src={current.thumbnail}
                alt={current.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Sprout size={64} className="text-emerald-300" />
            )}
            {/* Source badge */}
            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-widest bg-black/30 text-white px-2 py-1 rounded-full">
              {current.source === "ai" ? "AI pick" : "Perenual"}
            </span>
          </div>

          {/* Info */}
          <div className="p-5 flex flex-col gap-2">
            <div>
              <h3 className="text-lg font-black text-rhozly-on-surface leading-tight">
                {current.name}
              </h3>
              {current.scientific_name && (
                <p className="text-xs text-rhozly-on-surface/40 italic">
                  {current.scientific_name}
                </p>
              )}
            </div>
            <p className="text-sm text-rhozly-on-surface/70 leading-snug line-clamp-2">
              {current.tagline}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {current.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tagClass(tag)}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-8">
        <button
          onClick={() => handleSwipe("negative")}
          className="w-16 h-16 rounded-full border-2 border-red-200 bg-white flex items-center justify-center shadow-md hover:bg-red-50 hover:border-red-400 transition active:scale-95"
          aria-label="Dislike"
        >
          <X size={28} className="text-red-400" />
        </button>

        {loading && deck.length <= 2 && (
          <Loader2 size={16} className="animate-spin text-rhozly-on-surface/30" />
        )}

        <button
          onClick={() => handleSwipe("positive")}
          className="w-16 h-16 rounded-full border-2 border-emerald-200 bg-white flex items-center justify-center shadow-md hover:bg-emerald-50 hover:border-emerald-400 transition active:scale-95"
          aria-label="Like"
        >
          <Heart size={28} className="text-emerald-500" />
        </button>
      </div>

      <p className="text-xs text-rhozly-on-surface/40 -mt-2">
        <X size={10} className="inline mr-1" />
        skip &nbsp;·&nbsp;
        <Heart size={10} className="inline mr-1" />
        save to profile
      </p>
    </div>
  );
}
