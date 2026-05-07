import React from "react";
import { useNavigate } from "react-router-dom";
import { Stethoscope, LayoutTemplate, ScanLine, Sun, Sunrise, BookOpen, ChevronRight } from "lucide-react";

interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  path: string;
  color: string;
}

const TOOLS: Tool[] = [
  {
    id: "garden-ai",
    icon: <Stethoscope size={22} />,
    label: "Garden AI",
    description: "Identify plants, diagnose problems, and get AI-powered care advice.",
    path: "/doctor",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    id: "garden-layout",
    icon: <LayoutTemplate size={22} />,
    label: "Garden Layout",
    description: "Design and visualise your garden in 2D and 3D.",
    path: "/garden-layout",
    color: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    id: "plant-visualiser",
    icon: <ScanLine size={22} />,
    label: "Plant Visualiser",
    description: "Preview how plants look in your space using your camera.",
    path: "/visualiser",
    color: "bg-sky-50 text-sky-700 border-sky-100",
  },
  {
    id: "light-sensor",
    icon: <Sun size={22} />,
    label: "Light Sensor",
    description: "Measure light levels to find the perfect spot for each plant.",
    path: "/lightsensor",
    color: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    id: "sun-tracker",
    icon: <Sunrise size={22} />,
    label: "Sun Tracker",
    description: "Point your camera at the sky to see the sun's path and garden shadow zones.",
    path: "/sun-trajectory",
    color: "bg-orange-50 text-orange-700 border-orange-100",
  },
  {
    id: "guides",
    icon: <BookOpen size={22} />,
    label: "Guides",
    description: "Step-by-step care guides written for all gardening levels.",
    path: "/guides",
    color: "bg-rose-50 text-rose-700 border-rose-100",
  },
];

export default function ToolsHub() {
  const navigate = useNavigate();

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-rhozly-on-surface mb-1">Tools</h1>
      <p className="text-sm text-rhozly-on-surface/50 font-semibold mb-6">
        Everything you need to grow smarter.
      </p>

      <div className="flex flex-col gap-3">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            data-testid={`tools-hub-${tool.id}`}
            onClick={() => navigate(tool.path)}
            className="flex items-center gap-4 w-full text-left bg-white border border-rhozly-outline/15 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-rhozly-outline/30 transition-all group"
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
    </div>
  );
}
