import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { IconPlanner, IconShopping } from "../constants/icons";
import PlannerDashboard from "./PlannerDashboard";
import ShoppingLists from "./ShoppingLists";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  perenualEnabled?: boolean;
}

const TABS = [
  { id: "planner",  label: "Planner",  icon: <IconPlanner size={15} /> },
  { id: "shopping", label: "Shopping", icon: <IconShopping size={15} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PlannerHub({ homeId, aiEnabled = false, perenualEnabled = false }: Props) {
  const [params, setParams] = useSearchParams();
  const activeTab: TabId = (params.get("tab") as TabId) ?? "planner";

  const [contentKey, setContentKey] = useState<TabId>(activeTab);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    setOpacity(0);
    const t = setTimeout(() => {
      setContentKey(activeTab);
      setOpacity(1);
    }, 80);
    return () => clearTimeout(t);
  }, [activeTab]);

  const switchTab = (id: TabId) => {
    if (id === "planner") {
      setParams({});
    } else {
      setParams({ tab: id });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-rhozly-bg/95 backdrop-blur-sm border-b border-rhozly-outline/10 px-4 md:px-8 pt-4">
        <div role="tablist" aria-label="Planner sections" className="flex gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                data-testid={`planner-hub-tab-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-t-xl text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
                  isActive
                    ? "text-rhozly-primary border-rhozly-primary bg-rhozly-primary/5"
                    : "text-rhozly-on-surface/40 border-transparent hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low"
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
      <div className="flex-1 overflow-auto relative">
        {opacity < 1 && (
          <div className="absolute inset-x-0 top-0 h-1 bg-rhozly-primary/20 animate-pulse z-10" />
        )}
        <div key={contentKey} style={{ opacity, transition: "opacity 0.15s ease" }} className="h-full">
          {contentKey === "planner" && (
            <PlannerDashboard homeId={homeId} aiEnabled={aiEnabled} />
          )}
          {contentKey === "shopping" && (
            <ShoppingLists homeId={homeId} aiEnabled={aiEnabled} perenualEnabled={perenualEnabled} />
          )}
        </div>
      </div>
    </div>
  );
}
