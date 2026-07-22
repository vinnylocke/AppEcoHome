import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Leaf, Sprout } from "lucide-react";
import { IconPlants, IconAilment } from "../constants/icons";
import TheShed from "./TheShed";
import AilmentWatchlist from "./AilmentWatchlist";
import SenescenceTab from "./garden/SenescenceTab";
import NurseryTab from "./nursery/NurseryTab";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  perenualEnabled?: boolean;
}

// Hub v3 Stage D (2026-07-22): the hub reaches its final two-tab form —
// Plants | Ailments, identical anatomy (Presence × Curation on both).
// Nursery = the Seed box sheet inside Plants (supplies, not a world);
// Senescence = the Inactive chip (a derived state, not a place). Internal
// ids stay shed/watchlist (Shepherd anchors + URL params). The legacy flag
// (rhozly_legacy_shed_filters=on) restores the old four tabs.
const TABS = [
  { id: "shed",       label: "Plants",   icon: <IconPlants size={16} /> },
  { id: "watchlist",  label: "Ailments", icon: <IconAilment size={16} /> },
] as const;

const LEGACY_TABS = [
  { id: "shed",       label: "Plants",    icon: <IconPlants size={16} /> },
  { id: "watchlist",  label: "Watchlist", icon: <IconAilment size={16} /> },
  { id: "nursery",    label: "Nursery",   icon: <Sprout size={16} /> },
  { id: "senescence", label: "Senescence", icon: <Leaf size={16} /> },
] as const;

type TabId = (typeof LEGACY_TABS)[number]["id"];

export default function GardenHub({ homeId, aiEnabled = false, perenualEnabled = false }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const legacyTabs =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("rhozly_legacy_shed_filters") === "on";
  const tabs = legacyTabs ? LEGACY_TABS : TABS;
  const rawTab: TabId = (params.get("tab") as TabId) ?? "shed";
  // Stage D redirects (URLs never die): ?tab=nursery → Plants + Seed box;
  // ?tab=senescence[&plant=] → Plants + the Inactive chip (+ plant modal).
  const activeTab: TabId = legacyTabs
    ? rawTab
    : rawTab === "nursery" || rawTab === "senescence"
      ? "shed"
      : rawTab;
  useEffect(() => {
    if (legacyTabs) return;
    if (rawTab === "nursery") {
      const next = new URLSearchParams(params);
      next.delete("tab");
      next.set("open", "seed-box");
      setParams(next, { replace: true });
    } else if (rawTab === "senescence") {
      const next = new URLSearchParams(params);
      next.delete("tab");
      next.set("chip", "inactive");
      setParams(next, { replace: true }); // keeps &plant= if present
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab, legacyTabs]);

  const [visible, setVisible] = useState(true);
  const prevTab = useRef(activeTab);

  useEffect(() => {
    if (prevTab.current !== activeTab) {
      setVisible(false);
      const t = setTimeout(() => {
        setVisible(true);
        prevTab.current = activeTab;
      }, 80);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

  const switchTab = (id: TabId) => {
    if (id === "shed") {
      setParams({});
    } else {
      setParams({ tab: id });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar. overflow-x-auto + scrollbar-none keeps any overflow
          contained inside the strip so it can never push the whole page
          wide (mobile horizontal-scroll bug). Compact sizing on mobile
          so the anchored first two of the four tabs always fit on common
          phone widths (the strip scrolls for the rest). */}
      <div className="sticky top-0 z-10 bg-rhozly-bg/95 backdrop-blur-sm border-b border-rhozly-outline/10 px-2 md:px-8 pt-4">
        <div
          role="tablist"
          aria-label="Garden sections"
          className="flex gap-1 overflow-x-auto scrollbar-none"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                data-testid={`garden-hub-tab-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-1.5 md:gap-2 shrink-0 whitespace-nowrap px-2.5 md:px-4 py-2.5 min-h-[44px] rounded-t-xl text-[12px] md:text-[13px] uppercase tracking-wide md:tracking-widest transition-all border-b-2 -mb-px ${
                  isActive
                    ? "font-bold text-rhozly-primary border-rhozly-primary bg-rhozly-primary/5"
                    : "font-normal text-rhozly-on-surface/40 border-transparent hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className={`transition-opacity duration-150 h-full ${visible ? "opacity-100" : "opacity-0"}`}>
          {activeTab === "shed" && (
            <TheShed homeId={homeId} aiEnabled={aiEnabled} perenualEnabled={perenualEnabled} />
          )}
          {activeTab === "watchlist" && (
            <AilmentWatchlist homeId={homeId} aiEnabled={aiEnabled} perenualEnabled={perenualEnabled} />
          )}
          {activeTab === "nursery" && (
            <NurseryTab homeId={homeId} aiEnabled={aiEnabled} perenualEnabled={perenualEnabled} />
          )}
          {activeTab === "senescence" && (
            <SenescenceTab homeId={homeId} aiEnabled={aiEnabled} />
          )}
        </div>
      </div>
    </div>
  );
}
