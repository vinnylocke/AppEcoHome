import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Leaf, BookOpenCheck, Users as UsersIcon, Sun, Droplets } from "lucide-react";
import ManualPlantCreation from "./ManualPlantCreation";
import GrowGuideTab from "./GrowGuideTab";
import CompanionPlantsTab from "./CompanionPlantsTab";
import LightTab from "./LightTab";
import SensorRequirementsTab from "./SensorRequirementsTab";
import { useCataloguePlantFromResult } from "../hooks/useCataloguePlantFromResult";
import type { ProviderSearchResult } from "../lib/verdantlyUtils";
import { formatOtherNames, preferPickedName } from "../lib/plantNames";

interface Props {
  result: ProviderSearchResult;
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
  onClose: () => void;
  /** z-index class — defaults above a host modal already at z-[100]. */
  zIndexClassName?: string;
  /** Hub v3 Stage E — host-supplied sticky footer (the three-verb actions:
   *  Plant it / Sow seeds / Save for later). The modal stays inspection-only;
   *  the host owns what the verbs do. */
  actionsSlot?: React.ReactNode;
}

type Tab = "care" | "grow" | "companions" | "light" | "soil";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "care",       label: "Care Guide", icon: <Leaf size={14} /> },
  { id: "grow",       label: "Grow Guide", icon: <BookOpenCheck size={14} /> },
  { id: "companions", label: "Companions", icon: <UsersIcon size={14} /> },
  { id: "light",      label: "Light",      icon: <Sun size={14} /> },
  { id: "soil",       label: "Soil Needs", icon: <Droplets size={14} /> },
];

/**
 * Full plant-detail overlay — the Care Guide + Grow Guide + Companions +
 * Light tabs for a plant that may not be in the catalogue yet. Reuses the
 * same building blocks as the Library's full-screen `PlantPreview`, but as
 * a portal overlay so it can stack above another modal (e.g. Add-to-Shed)
 * without tearing down the host's state. Inspection-only — no Save; the
 * host owns adding the plant.
 */
export default function PlantDetailModal({
  result,
  homeId,
  aiEnabled,
  isPremium,
  onClose,
  zIndexClassName = "z-[140]",
  actionsSlot,
}: Props) {
  const { plant, ensuring, error } = useCataloguePlantFromResult(result, homeId);
  const [activeTab, setActiveTab] = useState<Tab>("care");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const sciLine = plant?.details.scientific_name?.[0] ?? null;
  // Keep the variety/cultivar the user actually picked ("Radish 'French
  // Breakfast'") instead of the species name the catalogue clone collapses to
  // ("Radish"). The clone still provides the care DATA; this is display only.
  const displayName = preferPickedName(result.common_name, plant?.details.common_name);

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in`}>
      <div
        ref={modalRef}
        tabIndex={-1}
        data-testid="plant-detail-modal"
        className="bg-rhozly-surface-lowest w-full max-w-2xl h-[85vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden relative"
      >
        <div className="p-6 sm:p-8 pb-4 shrink-0 flex justify-between items-start border-b border-rhozly-outline/10">
          <div className="min-w-0">
            <h3 data-testid="plant-detail-name" className="text-2xl sm:text-3xl font-black break-words line-clamp-2">
              {displayName}
            </h3>
            {sciLine && (
              <p className="text-[11px] font-bold italic text-rhozly-on-surface/45 truncate mt-1">
                {sciLine}
              </p>
            )}
            {(() => {
              const others = formatOtherNames(
                plant?.details.other_names ?? (result as any).other_names,
                [
                  plant?.details.common_name ?? result.common_name,
                  ...(Array.isArray(plant?.details.scientific_name) ? plant!.details.scientific_name : []),
                  ...(Array.isArray((result as any).scientific_name) ? (result as any).scientific_name : []),
                ],
              );
              return others.length > 0 ? (
                <p
                  data-testid="plant-detail-other-names"
                  className="text-[11px] font-semibold text-rhozly-on-surface/45 mt-1"
                >
                  Also known as: {others.join(", ")}
                </p>
              ) : null;
            })()}
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            data-testid="plant-detail-close"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        {error && !plant ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-sm font-bold text-rhozly-on-surface/60">
            {error}
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="px-6 sm:px-8 pt-4 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-hide">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`plant-detail-tab-${t.id}`}
                    aria-pressed={activeTab === t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-2xl text-[11px] font-black uppercase tracking-widest transition ${
                      activeTab === t.id
                        ? "bg-rhozly-primary text-white shadow-sm"
                        : "bg-white border border-rhozly-outline/15 text-rhozly-on-surface/65 hover:border-rhozly-primary/30"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab body */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-8 custom-scrollbar" data-testid="plant-detail-tab-body">
              {!plant ? (
                <div className="flex items-center justify-center py-16 gap-2 text-sm font-bold text-rhozly-on-surface/55">
                  <Loader2 size={16} className="animate-spin text-rhozly-primary" /> Loading plant…
                </div>
              ) : activeTab === "care" ? (
                <div className="rounded-3xl bg-white border border-rhozly-outline/15 overflow-hidden p-4 relative">
                  <ManualPlantCreation initialData={{ ...plant.details, common_name: displayName }} isReadOnly submitLabel="" />
                  {ensuring && (
                    <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center">
                      <div className="flex items-center gap-2 text-sm font-bold text-rhozly-on-surface/65">
                        <Loader2 size={16} className="animate-spin text-rhozly-primary" /> Loading the care guide…
                      </div>
                    </div>
                  )}
                </div>
              ) : plant.plantId > 0 ? (
                activeTab === "grow" ? (
                  <GrowGuideTab
                    plantId={plant.plantId}
                    commonName={displayName}
                    source={plant.source}
                    homeId={homeId}
                    aiEnabled={aiEnabled}
                    autoGenerate
                  />
                ) : activeTab === "companions" ? (
                  <CompanionPlantsTab
                    source={plant.source}
                    verdantlyId={plant.details.verdantly_id ?? null}
                    plantName={displayName}
                    homeId={homeId}
                    aiEnabled={aiEnabled}
                    isPremium={isPremium}
                  />
                ) : activeTab === "soil" ? (
                  <SensorRequirementsTab
                    plant={{
                      id: plant.plantId,
                      common_name: displayName,
                    }}
                    homeId={homeId}
                    aiEnabled={aiEnabled}
                  />
                ) : (
                  <LightTab
                    plantId={plant.plantId}
                    plantName={displayName}
                    homeId={homeId}
                  />
                )
              ) : ensuring ? (
                <div className="rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center text-sm font-bold text-rhozly-on-surface/55 flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-rhozly-primary" /> Preparing the plant…
                </div>
              ) : (
                // The "ensure into catalogue" call finished but didn't
                // land a real plantId (typical when the result is from an
                // external provider that hasn't been cloned in yet, or
                // when the Gemini round-trip failed). Show a clear next
                // step rather than an indefinite spinner.
                <div className="rounded-3xl bg-white border border-rhozly-outline/15 p-8 text-center space-y-3">
                  <p className="text-sm font-bold text-rhozly-on-surface/70 leading-relaxed">
                    {error ? `We couldn't pull this plant into your catalogue yet — ${error}` : "We haven't added this plant to your catalogue yet."}
                  </p>
                  <p className="text-xs font-medium text-rhozly-on-surface/45 leading-relaxed">
                    Use the "Add to Shed" action on the search result to unlock the full Grow Guide, Companion suggestions, and Light planning for this plant.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {actionsSlot && (
          <div
            data-testid="plant-detail-actions"
            className="shrink-0 border-t border-rhozly-outline/10 px-4 sm:px-6 py-3 bg-rhozly-surface-lowest"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
          >
            {actionsSlot}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
