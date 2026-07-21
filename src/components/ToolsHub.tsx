import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ArrowRight, Cpu, Bug, BarChart3 } from "lucide-react";
import { IconDoctor, IconLayout, IconScan, IconLight, IconSunTracker, IconGuides } from "../constants/icons";

interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  path: string;
  color: string;
}

type GroupId = "plan" | "measure" | "diagnose";

interface ToolGroup {
  id: GroupId;
  label: string;
  description: string;
  tools: Tool[];
}

const GROUPS: ToolGroup[] = [
  {
    id: "plan",
    label: "Plan & Design",
    description: "Sketch your garden, place plants, decide where things go.",
    tools: [
      {
        id: "garden-layout",
        icon: <IconLayout size={22} />,
        label: "Garden Layout",
        description: "Design and visualise your garden in 2D and 3D.",
        path: "/garden-layout",
        color: "bg-violet-100 text-violet-700 border-violet-200",
      },
      {
        id: "plant-visualiser",
        icon: <IconScan size={22} />,
        label: "Plant Visualiser",
        description: "Preview how plants look in your space using your camera.",
        path: "/visualiser",
        color: "bg-sky-100 text-sky-700 border-sky-200",
      },
    ],
  },
  {
    id: "measure",
    label: "Measure & Track",
    description: "Capture the conditions in your garden over time.",
    tools: [
      {
        id: "light-sensor",
        icon: <IconLight size={22} />,
        label: "Light Sensor",
        description: "Measure light levels to find the perfect spot for each plant.",
        path: "/lightsensor",
        color: "bg-amber-100 text-amber-700 border-amber-200",
      },
      {
        id: "sun-tracker",
        icon: <IconSunTracker size={22} />,
        label: "Sun Tracker",
        description: "Live AR sun overlay · year-round day length · per-bed sun hours.",
        path: "/sun-trajectory",
        color: "bg-orange-100 text-orange-700 border-orange-200",
      },
      {
        // B16 (dashboard-nav-tasks-tray Stage 5) — the monthly/yearly review
        // view, finally surfaced (was fully built but never routed).
        id: "garden-reports",
        icon: <BarChart3 size={22} />,
        label: "Garden Reports",
        description: "Your month and year in review — tasks done, harvests, plantings, trends.",
        path: "/reports",
        color: "bg-violet-100 text-violet-700 border-violet-200",
      },
    ],
  },
  {
    id: "diagnose",
    label: "Diagnose & Learn",
    description: "Get help when something looks off, or learn the basics.",
    tools: [
      {
        id: "plant-doctor",
        icon: <IconDoctor size={22} />,
        label: "Plant Doctor",
        description: "Snap a plant — identify it, diagnose problems and get AI care suggestions.",
        path: "/doctor",
        color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      },
      {
        id: "guides",
        icon: <IconGuides size={22} />,
        label: "Guides",
        description: "Step-by-step care guides written for all gardening levels.",
        path: "/guides",
        color: "bg-rose-100 text-rose-700 border-rose-200",
      },
      {
        // B5 (dashboard-nav-tasks-tray Stage 3/4) — the Ailment Library was a
        // whole reference library reachable ONLY from one Watchlist button.
        id: "ailment-library",
        icon: <Bug size={22} />,
        label: "Ailment Library",
        description: "Browse common pests, diseases and invasive plants — and how to tackle them.",
        path: "/ailment-library",
        color: "bg-amber-100 text-amber-700 border-amber-200",
      },
    ],
  },
];

interface Workflow {
  id: string;
  label: string;
  steps: Array<{ label: string; path: string }>;
}

const WORKFLOWS: Workflow[] = [
  {
    id: "new-bed",
    label: "Plan a new bed",
    steps: [
      { label: "Sketch in Garden Layout", path: "/garden-layout" },
      { label: "Check sun in Sun Tracker", path: "/sun-trajectory?mode=garden" },
      { label: "Preview in Visualiser",   path: "/visualiser" },
      { label: "Add supplies to Shopping",path: "/planner?tab=shopping" },
    ],
  },
  {
    id: "sick-plant",
    label: "A plant looks unwell",
    steps: [
      { label: "Snap a photo with Plant Doctor", path: "/doctor" },
      { label: "Confirm against guides",       path: "/guides" },
      { label: "Track on Watchlist",           path: "/shed?tab=watchlist" },
    ],
  },
  {
    id: "first-plant",
    label: "Just bought a new plant",
    steps: [
      { label: "Add it to the Shed",            path: "/shed" },
      { label: "Find a spot in Sun Tracker",    path: "/sun-trajectory?mode=garden" },
      { label: "Measure with Light Sensor",     path: "/lightsensor" },
      { label: "Set up a watering routine",     path: "/schedule" },
    ],
  },
];

export default function ToolsHub() {
  const navigate = useNavigate();

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <h1 data-testid="tools-heading" className="text-2xl font-black text-rhozly-on-surface mb-1">Tools</h1>
      <p className="text-sm text-rhozly-on-surface/50 font-semibold mb-6">
        Everything you need to grow smarter.
      </p>

      {/* Grouped tools */}
      <div className="space-y-7">
        {GROUPS.map((group) => (
          <section key={group.id} data-testid={`tools-group-${group.id}`}>
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                {group.label}
              </p>
              <p className="text-[11px] font-bold text-rhozly-on-surface/50 mt-0.5 leading-snug">
                {group.description}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {group.tools.map((tool) => (
                <button
                  key={tool.id}
                  data-testid={`tools-hub-${tool.id}`}
                  onClick={() => navigate(tool.path)}
                  className="flex items-center gap-4 w-full text-left bg-white border border-rhozly-outline/15 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-rhozly-outline/30 active:scale-[0.97] transition-all duration-100 focus-visible:ring-2 focus-visible:ring-rhozly-primary/50 focus-visible:outline-none group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${tool.color}`}>
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-rhozly-on-surface">{tool.label}</p>
                    <p className="text-xs text-rhozly-on-surface/50 font-semibold mt-0.5 leading-snug">
                      {tool.description}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-rhozly-on-surface/20 group-hover:text-rhozly-primary/50 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Connect hardware — surfaces the Integrations route prominently */}
      <section className="mt-7" data-testid="tools-hardware-cta">
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Connect Hardware
          </p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/50 mt-0.5 leading-snug">
            Bring smart sensors and valves into Rhozly — automate watering or read live soil moisture.
          </p>
        </div>
        <button
          onClick={() => navigate("/integrations")}
          className="w-full text-left bg-gradient-to-br from-sky-50 to-sky-100/60 border border-sky-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-sky-300 active:scale-[0.98] transition-all flex items-center gap-4 group"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-200/60 border border-sky-300/50 flex items-center justify-center shrink-0">
            <Cpu size={22} className="text-sky-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-sky-900">Connect a soil sensor or smart valve</p>
            <p className="text-xs font-bold text-sky-700/80 mt-0.5 leading-snug">
              Pair a device · live readings on each area · auto-trigger watering tasks. Works with popular brands.
            </p>
          </div>
          <ChevronRight size={16} className="text-sky-700/30 group-hover:text-sky-700 shrink-0 transition-colors" />
        </button>
      </section>

      {/* Workflows — multi-tool recipes */}
      <section className="mt-10" data-testid="tools-workflows">
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Workflows
          </p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/50 mt-0.5 leading-snug">
            Common multi-step jobs — tap any step to start.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {WORKFLOWS.map((wf) => (
            <div
              key={wf.id}
              data-testid={`tools-workflow-${wf.id}`}
              className="bg-white border border-rhozly-outline/15 rounded-2xl p-4 shadow-sm"
            >
              <p className="text-sm font-black text-rhozly-on-surface mb-3">{wf.label}</p>
              <ol className="space-y-1.5">
                {wf.steps.map((step, i) => (
                  <li key={i}>
                    <button
                      onClick={() => navigate(step.path)}
                      className="w-full flex items-center gap-2.5 text-left text-xs font-bold text-rhozly-on-surface/75 hover:text-rhozly-primary py-1.5 px-2 rounded-lg hover:bg-rhozly-primary/5 transition-colors group"
                    >
                      <span className="w-5 h-5 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 leading-snug">{step.label}</span>
                      <ArrowRight size={11} className="text-rhozly-on-surface/20 group-hover:text-rhozly-primary shrink-0" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
