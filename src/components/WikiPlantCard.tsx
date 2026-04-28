import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Leaf, Trash2, Sparkles, Check } from "lucide-react";
import { toast } from "react-hot-toast";
import { getPlantWikiInfo } from "../lib/wikipedia";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { scorePlantByPreferences } from "../hooks/useUserPreferences";

interface WikiPlantCardProps {
  plant: any;
  idx: number;
  isStarted: boolean;
  isPhase2Done: boolean;
  plantMapping: Record<number, string>;
  setPlantMapping: (mapping: Record<number, string>) => void;
  selectedForProcurement: number[];
  setSelectedForProcurement: (val: number[]) => void;
  handleDeletePlant: (idx: number) => void;
  shedPlants: any[];
}

export default function WikiPlantCard({
  plant,
  idx,
  isStarted,
  isPhase2Done,
  plantMapping,
  setPlantMapping,
  selectedForProcurement,
  setSelectedForProcurement,
  handleDeletePlant,
  shedPlants,
}: WikiPlantCardProps) {
  const { preferences } = usePlantDoctor();

  const [wikiData, setWikiData] = useState<{
    thumbnail: string | null;
    extract: string | null;
  }>({ thumbnail: null, extract: null });
  const [isLoading, setIsLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectFlash, setSelectFlash] = useState(false);

  // Sort shed plants so the closest name-match to this plan plant comes first.
  const rankedShedPlants = useMemo(() => {
    if (!shedPlants.length) return shedPlants;
    return [...shedPlants].sort((a, b) => {
      const scoreA = scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: a.common_name, sentiment: "positive" },
      ]);
      const scoreB = scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: b.common_name, sentiment: "positive" },
      ]);
      return scoreB - scoreA;
    });
  }, [shedPlants, plant.common_name]);

  const plantPrefScore = useMemo(
    () => scorePlantByPreferences(plant.common_name, plant.scientific_name || "", preferences),
    [plant.common_name, plant.scientific_name, preferences],
  );

  const topShedMatch = rankedShedPlants[0];
  const topMatchScore = topShedMatch
    ? scorePlantByPreferences(plant.common_name, "", [
        { home_id: "", entity_type: "plant", entity_name: topShedMatch.common_name, sentiment: "positive" },
      ])
    : 0;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setImageLoaded(false);

    const fetchInfo = async () => {
      try {
        const data = await getPlantWikiInfo(plant.common_name);
        if (isMounted && data) {
          setWikiData(data);
        }
      } catch (error) {
        console.error("Error loading wiki data:", error);
        if (isMounted) {
          toast.error(`Could not load info for ${plant.common_name}`);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInfo();

    return () => {
      isMounted = false;
    };
  }, [plant.common_name]);

  const isCreate = plantMapping[idx] === "create" || !plantMapping[idx];

  const handleDelete = () => {
    handleDeletePlant(idx);
    toast.success(`${plant.common_name} removed from plan`);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setPlantMapping({ ...plantMapping, [idx]: val });
    if (val !== "create") {
      setSelectedForProcurement(
        selectedForProcurement.filter((i: any) => i !== idx),
      );
    }
    setSelectFlash(true);
    setTimeout(() => setSelectFlash(false), 1200);
  };

  return (
    <div className="p-5 border border-[color:var(--color-rhozly-outline)] rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 animate-in fade-in">
      {/* 1. TOP BAR: Title & Controls */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-3">
          {isCreate && (
            <label className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={selectedForProcurement.includes(idx)}
                onChange={(e) =>
                  e.target.checked
                    ? setSelectedForProcurement([...selectedForProcurement, idx])
                    : setSelectedForProcurement(
                        selectedForProcurement.filter((i: any) => i !== idx),
                      )
                }
                className="w-5 h-5 rounded border-[color:var(--color-rhozly-outline)] text-[color:var(--color-rhozly-primary)] focus:ring-[color:var(--color-rhozly-primary)] cursor-pointer"
              />
            </label>
          )}
          <div>
            <h3 className="font-black text-gray-900 text-lg leading-tight">
              {plant.common_name}{" "}
              <span className="text-[color:var(--color-rhozly-primary-container)]">(x{plant.quantity})</span>
            </h3>
            <p className="text-[11px] text-[color:var(--color-rhozly-primary)] font-semibold italic tracking-wide mt-0.5">
              {plant.scientific_name}
            </p>
            {plantPrefScore > 0 && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-black text-[color:var(--color-rhozly-primary)] bg-[color:var(--color-rhozly-surface-low)] px-2 py-0.5 rounded-full border border-[color:var(--color-rhozly-outline)]">
                <Sparkles size={9} /> Preferred plant
              </span>
            )}
          </div>
        </div>

        {isStarted && !isPhase2Done && (
          <button
            onClick={handleDelete}
            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors shrink-0"
            title="Remove this plant"
            aria-label={`Remove ${plant.common_name} from plan`}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* 2. MIDDLE CONTENT: Image & Info */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-32 h-40 sm:h-32 shrink-0 rounded-xl overflow-hidden bg-[color:var(--color-rhozly-surface-low)] border border-[color:var(--color-rhozly-outline)] flex items-center justify-center relative">
          {isLoading ? (
            <Loader2 className="animate-spin text-[color:var(--color-rhozly-primary)]" size={24} />
          ) : wikiData.thumbnail ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 bg-[color:var(--color-rhozly-surface)] animate-pulse" />
              )}
              <img
                src={wikiData.thumbnail}
                alt={plant.common_name}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <Leaf className="text-[color:var(--color-rhozly-primary)]" size={32} style={{ opacity: 0.3 }} />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {wikiData.extract && (
            <div>
              <p
                className={`text-sm text-gray-600 italic leading-relaxed border-l-2 border-[color:var(--color-rhozly-primary)] pl-3 ${isExpanded ? "" : "line-clamp-3"}`}
                style={{ borderColor: "var(--color-rhozly-primary)", opacity: 0.7 }}
              >
                "{wikiData.extract}"
              </p>
              {wikiData.extract.length > 150 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[11px] font-black text-[color:var(--color-rhozly-primary)] hover:text-[color:var(--color-rhozly-primary-container)] mt-1.5 ml-3 uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-rhozly-primary)] focus-visible:ring-offset-2 rounded-sm px-1"
                  aria-label={isExpanded ? `Read less about ${plant.common_name}` : `Read more about ${plant.common_name}`}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? "Read Less" : "Read More"}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {plant.aesthetic_reason && (
              <div className="p-3 bg-[color:var(--color-rhozly-surface-low)] rounded-xl border border-[color:var(--color-rhozly-outline)]">
                <span className="font-black text-[10px] uppercase tracking-wider text-[color:var(--color-rhozly-primary)] block mb-1">
                  Aesthetic Fit
                </span>
                <p className="text-xs text-gray-700 leading-snug">
                  {plant.aesthetic_reason}
                </p>
              </div>
            )}
            {plant.horticultural_reason && (
              <div className="p-3 bg-[color:var(--color-rhozly-surface-low)] rounded-xl border border-[color:var(--color-rhozly-outline)]">
                <span className="font-black text-[10px] uppercase tracking-wider text-[color:var(--color-rhozly-primary)] block mb-1">
                  Environment Fit
                </span>
                <p className="text-xs text-gray-700 leading-snug">
                  {plant.horticultural_reason}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM BAR: Sourcing Controls */}
      <div
        className={`pt-3 mt-1 border-t border-[color:var(--color-rhozly-outline)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${!isStarted ? "opacity-30 grayscale pointer-events-none select-none" : ""}`}
      >
        <p className="text-xs font-bold text-[color:var(--color-rhozly-primary)] bg-[color:var(--color-rhozly-surface-low)] px-3 py-2 rounded-lg inline-flex items-center gap-2">
          <Sparkles size={14} className="text-[color:var(--color-rhozly-primary-container)] shrink-0" />{" "}
          {plant.procurement_advice}
        </p>

        <div className="relative w-full sm:w-auto">
          <select
            value={plantMapping[idx] || "create"}
            onChange={handleSelectChange}
            className="w-full sm:w-auto min-h-[44px] px-3 py-2.5 bg-white rounded-xl border border-[color:var(--color-rhozly-outline)] text-sm font-bold shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-rhozly-primary)] pr-8 appearance-none cursor-pointer"
          >
            <option value="create">Needs Procurement</option>
            {rankedShedPlants.length > 0 && (
              <optgroup label="Link to Shed">
                {rankedShedPlants.map((sp: any) => (
                  <option key={sp.id} value={sp.id}>
                    {sp === topShedMatch && topMatchScore > 0 ? "Best match: " : "Link: "}
                    {sp.common_name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selectFlash && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--color-rhozly-primary)] pointer-events-none animate-in fade-in zoom-in duration-150">
              <Check size={16} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
