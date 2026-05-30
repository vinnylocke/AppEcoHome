import React, { useState, useRef, useEffect } from "react";
import { Plus, CheckSquare, MapPin, ListChecks } from "lucide-react";
import { IconPlant, IconPlanner, IconAilment, IconGuides } from "../constants/icons";
import { useNavigate } from "react-router-dom";

const ITEMS = [
  {
    label: "Add Task",
    icon: <CheckSquare size={16} />,
    url: "/dashboard?view=calendar&open=add-task",
    testId: "quick-add-add-task",
  },
  {
    label: "Add To-Do List",
    icon: <ListChecks size={16} />,
    url: "/dashboard?view=calendar&open=add-todo-list",
    testId: "quick-add-add-todo-list",
  },
  {
    label: "My To-Do Lists",
    icon: <ListChecks size={16} />,
    url: "/dashboard?view=calendar&open=todo-lists",
    testId: "quick-add-todo-lists",
  },
  {
    label: "Add Task Automation",
    icon: <CheckSquare size={16} />,
    url: "/schedule?open=add-task",
    testId: "quick-add-create-task",
  },
  {
    label: "Add Plant",
    icon: <IconPlant size={16} />,
    url: "/shed?open=add-plant",
    testId: "quick-add-add-plant",
  },
  {
    label: "Create Plan",
    icon: <IconPlanner size={16} />,
    url: "/planner?open=new-plan",
    testId: "quick-add-create-plan",
  },
  {
    label: "Create Location",
    icon: <MapPin size={16} />,
    url: "/management?open=add-location",
    testId: "quick-add-create-location",
  },
  {
    label: "Log Ailment",
    icon: <IconAilment size={16} />,
    url: "/shed?tab=watchlist&open=add-ailment",
    testId: "quick-add-log-ailment",
  },
  {
    label: "Create Guide",
    icon: <IconGuides size={16} />,
    url: "/guides?tab=community&open=new-guide",
    testId: "quick-add-create-guide",
  },
] as const;

export default function GlobalQuickAdd() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="global-quick-add-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick add"
        aria-expanded={open}
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
      >
        <Plus size={20} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-xl border border-rhozly-outline/20 py-2 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {ITEMS.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                setOpen(false);
                navigate(item.url);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-primary/5 transition-colors text-left min-h-[44px]"
            >
              <span className="text-rhozly-primary shrink-0">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
