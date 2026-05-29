import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";
import { IconPlants, IconAilment } from "../constants/icons";
import TheShed from "./TheShed";
import AilmentWatchlist from "./AilmentWatchlist";
import SenescenceTab from "./garden/SenescenceTab";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  perenualEnabled?: boolean;
}

const TABS = [
  { id: "shed",       label: "Plants",    icon: <IconPlants size={16} /> },
  { id: "watchlist",  label: "Watchlist", icon: <IconAilment size={16} /> },
  { id: "senescence", label: "Senescence", icon: <Leaf size={16} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function GardenHub({ homeId, aiEnabled = false, perenualEnabled = false }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab: TabId = (params.get("tab") as TabId) ?? "shed";

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
          so all three tabs fit without scrolling on common phone widths. */}
      <div className="sticky top-0 z-10 bg-rhozly-bg/95 backdrop-blur-sm border-b border-rhozly-outline/10 px-2 md:px-8 pt-4">
        <div
          role="tablist"
          aria-label="Garden sections"
          className="flex gap-1 overflow-x-auto scrollbar-none"
        >
          {TABS.map((tab) => {
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
            <AilmentWatchlist homeId={homeId} aiEnabled={aiEnabled} />
          )}
          {activeTab === "senescence" && (
            <SenescenceTab homeId={homeId} aiEnabled={aiEnabled} />
          )}
        </div>
      </div>
    </div>
  );
}
