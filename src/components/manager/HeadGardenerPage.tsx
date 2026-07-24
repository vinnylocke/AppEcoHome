import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Compass, LayoutDashboard, ClipboardList, CalendarDays, Sparkles, MessageCircle } from "lucide-react";
import FeatureGate from "../shared/FeatureGate";
import AiInsightsPage from "../AiInsightsPage";
import GardenBriefPanel from "./GardenBriefPanel";
import ManagerReportPanel from "./ManagerReportPanel";
import ManagerYearPlan from "./ManagerYearPlan";
import ManagerLog from "./ManagerLog";
import HeadGardenerChat from "./HeadGardenerChat";

type ManagerTab = "overview" | "brief" | "year" | "insights" | "ask";

const TABS: Array<{ id: ManagerTab; label: string; icon: React.ReactElement }> = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
  { id: "brief", label: "Brief", icon: <ClipboardList size={15} /> },
  { id: "year", label: "Year Plan", icon: <CalendarDays size={15} /> },
  { id: "insights", label: "Insights", icon: <Sparkles size={15} /> },
  { id: "ask", label: "Ask", icon: <MessageCircle size={15} /> },
];

function HeadGardenerPageInner({ homeId }: { homeId: string }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as ManagerTab) || "overview";

  const setTab = (next: ManagerTab) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const panel = useMemo(() => {
    switch (tab) {
      case "brief":
        return <GardenBriefPanel homeId={homeId} />;
      case "year":
        return <ManagerYearPlan homeId={homeId} />;
      case "insights":
        // The existing unified insights feed, embedded as the manager's raw signal layer.
        return <AiInsightsPage />;
      case "ask":
        return <HeadGardenerChat homeId={homeId} />;
      case "overview":
      default:
        return (
          <div className="space-y-6">
            <ManagerReportPanel homeId={homeId} />
            <ManagerLog homeId={homeId} />
          </div>
        );
    }
  }, [tab, homeId]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5" data-testid="head-gardener-page">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
          <Compass size={20} className="text-rhozly-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-rhozly-on-surface tracking-tight">Head Gardener</h1>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5">
            Your AI garden manager
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" data-testid="head-gardener-tabs" role="tablist">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              data-testid={`head-gardener-tab-${t.id}`}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[13px] font-black whitespace-nowrap transition-colors ${
                active
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface text-rhozly-on-surface/55 hover:text-rhozly-on-surface/80"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      <div data-testid={`head-gardener-panel-${tab}`}>{panel}</div>
    </div>
  );
}

/**
 * Head Gardener — the flagship AI garden-manager tab. A single, first-person manager
 * that oversees the whole home: a confirmed Garden Brief (goals + constraints), a
 * standing Estate Report, a rolling Year Plan, the raw insights feed, and a grounded
 * chat. Evergreen-gated via the `head_gardener` feature.
 * See docs/plans/head-gardener-ai-manager.md.
 */
export default function HeadGardenerPage({ homeId }: { homeId: string }) {
  return (
    <FeatureGate feature="head_gardener">
      <HeadGardenerPageInner homeId={homeId} />
    </FeatureGate>
  );
}
