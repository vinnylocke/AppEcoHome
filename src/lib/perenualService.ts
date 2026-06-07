import { supabase } from "./supabase";
import { Logger } from "./errorHandler";
import type { ImageCredit } from "./imageCredit";
import { PROVIDER_DEFAULT_LICENSE_URL } from "./imageCredit";

const CACHE_TTL_DAYS = 30;

// Wave 22.0002 — Perenual's default_image carries explicit licence data.
// Normalise it into the unified ImageCredit shape so it survives down to
// the UI badge.
function buildPerenualImageCredit(
  defaultImage: any,
  speciesId: number | string | undefined,
): ImageCredit | null {
  if (!defaultImage) return null;
  const licenseName = typeof defaultImage.license_name === "string"
    ? defaultImage.license_name
    : null;
  const licenseUrl = typeof defaultImage.license_url === "string"
    ? defaultImage.license_url
    : (PROVIDER_DEFAULT_LICENSE_URL.perenual ?? null);
  const sourceUrl = typeof defaultImage.original_url === "string"
    ? defaultImage.original_url
    : (speciesId != null ? `https://perenual.com/plant/${speciesId}` : null);
  const lc = (licenseName ?? "").toLowerCase();
  const commercialOk = lc.includes("public domain")
    || lc.includes("cc0")
    || (lc.includes("cc") && !lc.includes("nc"));
  return {
    provider:      "perenual",
    license_name:  licenseName,
    license_url:   licenseUrl,
    attribution:   null,
    source_url:    sourceUrl,
    commercial_ok: commercialOk || null,
  };
}

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

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("perenual-proxy", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface PerenualSearchFilters {
  cycle?: string[];
  watering?: string[];
  sunlight?: string[];
  edible?: 0 | 1;
  poisonous?: 0 | 1;
  indoor?: 0 | 1;
  hardinessMin?: number;
  hardinessMax?: number;
}

export interface PerenualSearchPage {
  /** Raw Perenual records for this page. */
  data: any[];
  /** True when the API reports more pages beyond `page`. */
  hasMore: boolean;
  /** Page number to fetch next if `hasMore`. */
  nextPage: number;
}

export const PerenualService = {
  /**
   * Paged Perenual search. Use this when the caller needs "Show more"
   * pagination — both BulkSearchModal and The Library do.
   */
  searchPlantsPaged: async (
    query: string,
    page = 1,
    filters?: PerenualSearchFilters,
  ): Promise<PerenualSearchPage> => {
    try {
      const result = await invoke<{
        data: any[];
        has_more?: boolean;
        current_page?: number;
        last_page?: number;
      }>({ action: "search", query, page, filters });
      return {
        data: result.data ?? [],
        hasMore: !!result.has_more,
        nextPage: (result.current_page ?? page) + 1,
      };
    } catch (error) {
      Logger.error("Perenual Search Failed", error);
      throw error;
    }
  },

  /**
   * Backwards-compatible single-page search — returns just `data` for the
   * first page. Callers that don't need pagination keep their existing
   * signature.
   */
  searchPlants: async (
    query: string,
    filters?: PerenualSearchFilters,
  ): Promise<any[]> => {
    const { data } = await PerenualService.searchPlantsPaged(query, 1, filters);
    return data;
  },

  // 2. Get Details (Checks Cache -> Then API via edge function)
  getPlantDetails: async (perenualId: number) => {
    try {
      let apiData = null;

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
          apiData = cached.raw_data;
        }
      }

      // STEP B: If no valid cache, fetch via edge function
      if (!apiData) {
        apiData = await invoke<any>({ action: "details", id: perenualId });

        // Save raw data to cache in the background
        supabase
          .from("species_cache")
          .upsert({ id: perenualId, raw_data: apiData, updated_at: new Date().toISOString() })
          .then(() => {});
      }

      const wateringDays = extractWateringDays(apiData.watering_general_benchmark);

      return {
        common_name: apiData.common_name || "Unknown",
        scientific_name: apiData.scientific_name || [],
        other_names: apiData.other_name || [],
        family: apiData.family || null,
        plant_type: apiData.type || null,
        cycle: apiData.cycle || null,
        image_url: apiData.default_image?.regular_url || null,
        thumbnail_url: apiData.default_image?.thumbnail || null,
        // Wave 22.0002 — capture licence + attribution from Perenual's
        // default_image object so downstream callers can credit it
        // wherever the image renders.
        image_credit: buildPerenualImageCredit(apiData.default_image, apiData.id),
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

  // 3. Search pest & disease list
  searchPestDisease: async (query: string, page = 1) => {
    try {
      const data = await invoke<{ data: any[] }>({ action: "pest-disease", query, page });
      return (data.data || []) as Array<{
        id: number;
        common_name: string;
        scientific_name: string | { subtitle: string; description: string };
        family: string | null;
        description: Array<{ subtitle: string; description: string }> | null;
        solution: Array<{ subtitle: string; description: string }> | null;
        host: string[] | null;
        images: Array<{
          thumbnail: string;
          small_url: string;
          medium_url: string;
          original_url: string;
        }> | null;
      }>;
    } catch (error) {
      Logger.error("Perenual Pest/Disease Search Failed", error);
      throw error;
    }
  },
};
