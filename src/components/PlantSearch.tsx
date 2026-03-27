import React, { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Droplets,
  Sun,
  History,
  TrendingUp,
  Info,
  X,
  Calendar,
  Leaf,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

// --- Utility: Blueprint Mapper ---
const mapPerenualToBlueprints = (speciesData: any, itemId: string) => {
  const blueprints = [];
  const waterMap: Record<string, number> = {
    Frequent: 3,
    Average: 7,
    Minimum: 14,
    None: 30,
  };

  blueprints.push({
    inventory_item_id: itemId,
    task_type: "watering",
    frequency_days: waterMap[speciesData.watering_freq] || 7,
    is_recurring: true,
    priority: "Medium",
  });

  if (speciesData.pruning_month && Array.isArray(speciesData.pruning_month)) {
    const monthMap: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    };
    speciesData.pruning_month.forEach((m: string) => {
      blueprints.push({
        inventory_item_id: itemId,
        task_type: "pruning",
        start_month: monthMap[m.toLowerCase()],
        is_recurring: false,
        priority: "Low",
      });
    });
  }
  return blueprints;
};

const PERENUAL_KEY = import.meta.env.VITE_PERENUAL_KEY;

interface PlantSearchProps {
  onPlantSelected: (plant: any) => void;
  homeId: string;
}

export const PlantSearch: React.FC<PlantSearchProps> = ({
  onPlantSelected,
  homeId,
}) => {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"library" | "perenual">("library");
  const [results, setResults] = useState<any[]>([]);

  // ✅ UNIVERSAL ID: All ID states are now strictly Strings
  const [globalPlantIds, setGlobalPlantIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsMap, setDetailsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);

  const refreshGlobalRegistry = async () => {
    const { data } = await supabase.from("plants").select("id");
    if (data) setGlobalPlantIds(new Set(data.map((p) => String(p.id))));
  };

  useEffect(() => {
    refreshGlobalRegistry();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setExpandedId(null);
    setError(null);

    if (activeTab === "library") {
      const { data } = await supabase
        .from("plants")
        .select("*")
        .ilike("common_name", `%${query}%`);
      setResults(data || []);
      setLoading(false);
    } else {
      try {
        // ✅ Using v2 for up-to-date search data
        const url = `https://perenual.com/api/v2/species-list?key=${PERENUAL_KEY}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        setResults(data.data || []);
      } catch (err) {
        setError("Search failed. Check your API key or connection.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExpand = async (id: any) => {
    const stringId = String(id);
    if (expandedId === stringId) return setExpandedId(null);
    setExpandedId(stringId);

    if (detailsMap[stringId]) return;

    setDetailsLoading(stringId);
    setError(null);

    try {
      const { data: cached } = await supabase
        .from("species_cache")
        .select("*")
        .eq("id", stringId)
        .maybeSingle();

      if (cached && cached.description && cached.description.length > 50) {
        setDetailsMap((prev) => ({ ...prev, [stringId]: cached }));
      } else {
        // ✅ Fetch Details via v2 API
        const d = await fetchDetails(stringId);
        if (!d) return;

        const searchResult =
          results.find((r) => String(r.id) === stringId) || {};
        let finalDescription = await fetchRichCareGuide(stringId);

        if (!finalDescription) {
          finalDescription =
            d.description ||
            `
            <div class="space-y-4">
              <p>The <strong>${d.common_name}</strong> is a ${d.cycle || searchResult.cycle || "unique"} species categorized as ${d.care_level?.toLowerCase() || "moderate"} maintenance.</p>
              <p>Typically requires <strong>${d.watering?.toLowerCase() || "regular"}</strong> watering and <strong>${(d.sunlight || searchResult.sunlight)?.join(", ") || "appropriate light"}</strong>.</p>
            </div>
          `;
        }

        const plantData = {
          id: stringId, // ✅ ID saved as String
          common_name: d.common_name,
          scientific_name:
            d.scientific_name || searchResult.scientific_name || [],
          image_url:
            d.default_image?.original_url ||
            searchResult.default_image?.original_url ||
            null,
          description: finalDescription,
          watering_freq: d.watering || searchResult.watering || "Average",
          sunlight: d.sunlight || searchResult.sunlight || [],
          cycle: d.cycle || searchResult.cycle || "Unknown",
          care_level: d.care_level || searchResult.care_level || "Moderate",
          pruning_month: d.pruning_month || [],
          flowering_season: d.flowering_season || null,
          fruiting_season: d.fruiting_season || null,
          growth_rate: d.growth_rate || "Moderate",
          created_at: new Date().toISOString(),
        };

        await supabase.from("species_cache").upsert(plantData);
        setDetailsMap((prev) => ({ ...prev, [stringId]: plantData }));
      }
    } catch (err) {
      setError("Botanical records temporarily unavailable.");
    } finally {
      setDetailsLoading(null);
    }
  };

  const handleAction = async (plant: any) => {
    setLoading(true);
    setError(null);
    const stringId = String(plant.id);

    try {
      const d = detailsMap[stringId] || (await fetchDetails(stringId));
      if (!d) throw new Error("Could not retrieve botanical details.");

      // 1. Upsert Parent (ensure ID is string)
      const plantData = {
        id: stringId,
        common_name: d.common_name,
        scientific_name: d.scientific_name || [],
        image_url: d.default_image?.original_url || null,
        description: d.description || detailsMap[stringId]?.description || "",
        watering_freq: d.watering || "Average",
        sunlight: d.sunlight || [],
        cycle: d.cycle || "Unknown",
        created_at: new Date().toISOString(),
      };

      const { error: cacheError } = await supabase
        .from("species_cache")
        .upsert(plantData);
      if (cacheError) throw new Error("Failed to cache plant details.");

      // 2. Insert Inventory Item (The User's specific instance)
      const { data: newItem, error: itemErr } = await supabase
        .from("inventory_items")
        .insert([
          {
            plant_id: stringId, // ✅ Text ID
            plant_name: d.common_name,
            home_id: homeId,
            status: "In Shed",
          },
        ])
        .select()
        .single();

      if (itemErr) throw itemErr;

      // 3. Insert Blueprints
      const blueprints = mapPerenualToBlueprints(d, newItem.id);
      await supabase.from("task_blueprints").insert(blueprints);

      onPlantSelected(newItem);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (id: string) => {
    // ✅ Using api/v2/ for full data access
    const url = `https://perenual.com/api/v2/species/details/${id}?key=${PERENUAL_KEY}`;
    try {
      const res = await fetch(url);
      if (res.status === 429) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const fetchRichCareGuide = async (id: string) => {
    const url = `https://perenual.com/api/species-care-guide-list?key=${PERENUAL_KEY}&species_id=${id}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return data.data[0].section
          .map(
            (s: any) => `
          <div class="mb-4 last:mb-0">
            <h6 class="text-[10px] font-black uppercase text-emerald-700 tracking-widest mb-1">${s.type}</h6>
            <p class="text-stone-600 leading-relaxed text-sm">${s.description}</p>
          </div>
        `,
          )
          .join("");
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[500px]">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
            size={18}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={
              activeTab === "library"
                ? "Search global registry..."
                : "Search Perenual..."
            }
            className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-emerald-500 text-sm"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
        >
          Search
        </button>
      </div>

      <div className="flex gap-2 p-1 bg-stone-100 rounded-2xl self-start">
        {["library", "perenual"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab as any);
              setResults([]);
              setError(null);
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all",
              activeTab === tab
                ? "bg-white text-emerald-600 shadow-sm"
                : "text-stone-500",
            )}
          >
            {tab === "library" ? "Our Library" : "Perenual API"}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600"
          >
            <AlertCircle size={18} className="shrink-0" />
            <p className="flex-1 text-[11px] leading-tight font-medium">
              {error}
            </p>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded-lg"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {results.map((r) => (
          <SearchResultCard
            key={String(r.id)}
            item={r}
            isGlobalVetted={globalPlantIds.has(String(r.id))}
            isExpanded={expandedId === String(r.id)}
            onExpand={() => handleExpand(String(r.id))}
            onAction={() => handleAction(r)}
            details={detailsMap[String(r.id)]}
            loading={detailsLoading === String(r.id)}
          />
        ))}
      </div>
    </div>
  );
};

// SearchResultCard remains visually the same but receives sanitized data
const SearchResultCard = ({
  item,
  isGlobalVetted,
  isExpanded,
  onExpand,
  onAction,
  details,
  loading,
}: any) => {
  const data = isExpanded ? details || item : item;

  return (
    <div
      className={cn(
        "border rounded-3xl overflow-hidden transition-all duration-300",
        isExpanded
          ? "border-emerald-200 bg-emerald-50/30 shadow-xl"
          : "border-stone-100 bg-white",
      )}
    >
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex items-center gap-4">
          <img
            src={
              data.thumbnail_url ||
              data.default_image?.thumbnail ||
              "/placeholder.png"
            }
            className="w-14 h-14 rounded-2xl object-cover bg-stone-50 border border-stone-100"
            alt=""
          />
          <div>
            <h4 className="font-bold text-stone-900 leading-tight">
              {data.common_name}
            </h4>
            <span className="text-[10px] text-stone-400 italic">
              {(data.scientific_name && data.scientific_name[0]) ||
                "Botanical species"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isGlobalVetted && (
            <span className="text-[8px] bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg font-black uppercase tracking-tighter">
              In Library
            </span>
          )}
          {isExpanded ? (
            <ChevronUp size={20} className="text-emerald-600" />
          ) : (
            <ChevronDown size={20} className="text-stone-300" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 border-t border-emerald-100/50 bg-white/50 space-y-6 animate-in slide-in-from-top-2 duration-300">
          {loading ? (
            <div className="flex flex-col items-center py-12 text-stone-400 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-xs font-black uppercase tracking-widest opacity-50">
                Consulting Global Registry...
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <QuickStat
                  icon={<Droplets size={14} />}
                  label="Water"
                  value={data.watering_freq || data.watering}
                  color="text-blue-500"
                />
                <QuickStat
                  icon={<Sun size={14} />}
                  label="Sunlight"
                  value={data.sunlight?.[0]}
                  color="text-amber-500"
                />
                <QuickStat
                  icon={<History size={14} />}
                  label="Cycle"
                  value={data.cycle}
                  color="text-purple-500"
                />
                <QuickStat
                  icon={<TrendingUp size={14} />}
                  label="Care"
                  value={data.care_level}
                  color="text-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50/50 p-4 rounded-2xl border border-stone-100">
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Leaf size={12} /> Growth & Seasons
                  </h5>
                  <div className="space-y-2">
                    <DetailRow label="Growth Rate" value={data.growth_rate} />
                    <DetailRow
                      label="Flowering"
                      value={data.flowering_season}
                    />
                    <DetailRow label="Fruiting" value={data.fruiting_season} />
                  </div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={12} /> Maintenance
                  </h5>
                  <div className="space-y-2">
                    <DetailRow
                      label="Pruning"
                      value={data.pruning_month?.join(", ")}
                    />
                    <DetailRow label="Difficulty" value={data.care_level} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <Info size={14} /> Care Overview
                </h5>
                <div className="text-sm text-stone-600 leading-relaxed bg-white p-5 rounded-3xl border border-stone-100 shadow-sm max-h-64 overflow-y-auto custom-scrollbar">
                  {data.description ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: data.description }}
                    />
                  ) : (
                    "Botanical details pending update."
                  )}
                </div>
              </div>

              <button
                onClick={onAction}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 hover:scale-[1.02] transition-all"
              >
                {isGlobalVetted ? (
                  <>
                    <Check size={20} /> Add to Shed
                  </>
                ) : (
                  <>
                    <Plus size={20} /> Import & Add to Shed
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const QuickStat = ({ icon, label, value, color }: any) => (
  <div className="bg-white p-2.5 rounded-2xl border border-stone-100 flex flex-col gap-1">
    <div className={cn("flex items-center gap-1.5", color)}>
      {icon}
      <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">
        {label}
      </span>
    </div>
    <span className="text-xs font-bold text-stone-700 capitalize truncate">
      {value || "—"}
    </span>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: any }) => (
  <div className="flex justify-between items-center text-[11px]">
    <span className="text-stone-400 font-medium">{label}</span>
    <span className="text-stone-700 font-bold capitalize">
      {value || "N/A"}
    </span>
  </div>
);
