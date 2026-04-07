import { supabase } from "./supabase";
import { Logger } from "./errorHandler";

const PERENUAL_API_KEY = import.meta.env.VITE_PERENUAL_API_KEY;
const CACHE_TTL_DAYS = 30;

// 🧹 DATA CLEANING HELPERS

const toUKTerms = (str: string | null) => {
  if (!str) return null;
  return str.replace(/Fall/gi, "Autumn");
};

const cleanMonths = (months: string[]) => {
  if (!months || !Array.isArray(months)) return [];
  const monthMap: Record<string, string> = {
    january: "Jan",
    february: "Feb",
    march: "Mar",
    april: "Apr",
    may: "May",
    june: "Jun",
    july: "Jul",
    august: "Aug",
    september: "Sep",
    october: "Oct",
    november: "Nov",
    december: "Dec",
  };

  const mapped = months.map((m) => monthMap[m.toLowerCase().trim()] || m);
  return Array.from(new Set(mapped));
};

const extractWateringDays = (benchmark: any) => {
  let min = null;
  let max = null;

  if (benchmark && benchmark.value) {
    const matches = String(benchmark.value).match(/\d+/g);

    if (matches && matches.length > 0) {
      const unit = benchmark.unit?.toLowerCase() || "days";
      const multiplier = unit === "weeks" ? 7 : unit === "months" ? 30 : 1;

      min = parseInt(matches[0], 10) * multiplier;
      max = matches.length > 1 ? parseInt(matches[1], 10) * multiplier : min;
    }
  }
  return { min, max };
};

const uniqueArray = (arr: any[]) => Array.from(new Set(arr || []));

export const PerenualService = {
  // 1. Live Search (Always hits the API)
  searchPlants: async (query: string) => {
    try {
      console.log(
        `🔎 [SEARCH] Hitting live Perenual API for query: "${query}"`,
      );
      const response = await fetch(
        `https://perenual.com/api/v2/species-list?key=${PERENUAL_API_KEY}&q=${query}`,
      );
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      Logger.error("Perenual Search Failed", error);
      throw error;
    }
  },

  // 2. Get Details (Checks Cache -> Then API)
  getPlantDetails: async (perenualId: number) => {
    try {
      let apiData = null;

      console.log(`⏳ [DETAILS] Fetching data for Plant ID: ${perenualId}...`);

      // STEP A: Check Cache
      const { data: cached } = await supabase
        .from("species_cache")
        .select("*")
        .eq("id", perenualId)
        .maybeSingle();

      if (cached) {
        const cacheAgeDays =
          (new Date().getTime() - new Date(cached.updated_at).getTime()) /
          (1000 * 3600 * 24);
        if (cacheAgeDays < CACHE_TTL_DAYS) {
          console.log(
            `✅ [CACHE HIT] Loaded Plant ${perenualId} instantly from your Supabase Database!`,
          );
          apiData = cached.raw_data;
        } else {
          console.log(
            `⚠️ [CACHE EXPIRED] Plant ${perenualId} cache is older than ${CACHE_TTL_DAYS} days. Fetching fresh data...`,
          );
        }
      }

      // STEP B: If no valid cache, hit the Perenual API
      if (!apiData) {
        console.log(
          `🌐 [API HIT] Downloading Plant ${perenualId} from Perenual API...`,
        );
        const response = await fetch(
          `https://perenual.com/api/v2/species/details/${perenualId}?key=${PERENUAL_API_KEY}`,
        );
        apiData = await response.json();

        // Save raw data to cache safely in the background
        supabase
          .from("species_cache")
          .upsert({
            id: perenualId,
            raw_data: apiData,
            updated_at: new Date().toISOString(),
          })
          .then(() => {
            console.log(
              `💾 [CACHE SAVED] Plant ${perenualId} successfully saved to Supabase for future use.`,
            );
          });
      }

      const wateringDays = extractWateringDays(
        apiData.watering_general_benchmark,
      );

      // STRICT MAPPING
      return {
        common_name: apiData.common_name || "Unknown",
        scientific_name: apiData.scientific_name || [],
        other_names: apiData.other_name || [],
        family: apiData.family || null,
        plant_type: apiData.type || null,
        cycle: apiData.cycle || null,
        image_url: apiData.default_image?.regular_url || null,
        thumbnail_url: apiData.default_image?.thumbnail || null,
        watering: apiData.watering || null,
        watering_benchmark: apiData.watering_general_benchmark || null,
        watering_min_days: wateringDays.min,
        watering_max_days: wateringDays.max,
        sunlight: uniqueArray(apiData.sunlight),
        care_level: apiData.care_level || null,
        hardiness_min: apiData.hardiness?.min || null,
        hardiness_max: apiData.hardiness?.max || null,
        is_edible: apiData.edible_fruit || apiData.edible_leaf || false,
        is_toxic_pets: apiData.poisonous_to_pets || false,
        is_toxic_humans: apiData.poisonous_to_humans || false,
        attracts: uniqueArray(apiData.attracts),
        description: apiData.description || null,
        maintenance: apiData.maintenance || null,
        growth_rate: apiData.growth_rate || null,
        drought_tolerant: apiData.drought_tolerant || false,
        salt_tolerant: apiData.salt_tolerant || false,
        thorny: apiData.thorny || false,
        invasive: apiData.invasive || false,
        tropical: apiData.tropical || false,
        indoor: apiData.indoor || false,
        pest_susceptibility: uniqueArray(apiData.pest_susceptibility),
        flowers: apiData.flowers || false,
        cones: apiData.cones || false,
        fruits: apiData.fruits || false,
        edible_leaf: apiData.edible_leaf || false,
        cuisine: apiData.cuisine || false,
        medicinal: apiData.medicinal || false,
        leaf: apiData.leaf !== false,
        flowering_season: toUKTerms(apiData.flowering_season),
        harvest_season: toUKTerms(apiData.harvest_season),
        pruning_month: cleanMonths(apiData.pruning_month),
        propagation: uniqueArray(apiData.propagation),
        perenual_id: apiData.id,
        source: "api",
      };
    } catch (error) {
      Logger.error("Perenual Detail Fetch Failed", error);
      throw error;
    }
  },
};
