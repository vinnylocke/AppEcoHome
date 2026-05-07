import React from "react";
import { useSearchParams } from "react-router-dom";
import { Map, ShoppingCart, BarChart3 } from "lucide-react";
import PlannerDashboard from "./PlannerDashboard";
import ShoppingLists from "./ShoppingLists";
import GardenReports from "./GardenReports";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  perenualEnabled?: boolean;
}

const TABS = [
  { id: "planner",  label: "Planner",  icon: <Map size={15} /> },
  { id: "shopping", label: "Shopping", icon: <ShoppingCart size={15} /> },
  { id: "reports",  label: "Reports",  icon: <BarChart3 size={15} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PlannerHub({ homeId, aiEnabled = false, perenualEnabled = false }: Props) {
  const [params, setParams] = useSearchParams();
  const activeTab: TabId = (params.get("tab") as TabId) ?? "planner";

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
        <div className="flex gap-1 max-w-7xl mx-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`planner-hub-tab-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
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
      <div className="flex-1 overflow-auto">
        {activeTab === "planner" && (
          <PlannerDashboard homeId={homeId} aiEnabled={aiEnabled} />
        )}
        {activeTab === "shopping" && (
          <ShoppingLists homeId={homeId} aiEnabled={aiEnabled} perenualEnabled={perenualEnabled} />
        )}
        {activeTab === "reports" && (
          <GardenReports homeId={homeId} />
        )}
      </div>
    </div>
  );
}
