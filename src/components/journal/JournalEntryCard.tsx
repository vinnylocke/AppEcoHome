import React from "react";
import { Link } from "react-router-dom";
import {
  Sprout,
  MapPin,
  Square,
  FileText,
  Globe,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { JournalEntry, JournalTargetType } from "../../types";
import { getEntryTargetType } from "../../hooks/useGlobalJournal";

interface Props {
  entry: JournalEntry;
  /** Display map (id → label) so cards can render a human-readable target chip. */
  targetLabels?: Partial<Record<JournalTargetType, Record<string, string>>>;
  /** Called when the user taps delete. Parent owns the confirm flow. */
  onDelete?: (entry: JournalEntry) => void;
}

const TYPE_META: Record<
  JournalTargetType,
  { icon: React.ReactNode; label: string; href: (id: string) => string | null }
> = {
  plant: {
    icon: <Sprout size={11} />,
    label: "Plant",
    href: (id) => `/shed?instance=${id}`,
  },
  location: {
    icon: <MapPin size={11} />,
    label: "Location",
    href: () => `/management`,
  },
  area: {
    icon: <Square size={11} />,
    label: "Area",
    href: () => `/management`,
  },
  plan: {
    icon: <FileText size={11} />,
    label: "Plan",
    href: (id) => `/planner?plan=${id}`,
  },
  none: {
    icon: <Globe size={11} />,
    label: "Unassigned",
    href: () => null,
  },
};

export default function JournalEntryCard({ entry, targetLabels, onDelete }: Props) {
  const type = getEntryTargetType(entry);
  const meta = TYPE_META[type];
  const targetId =
    entry.inventory_item_id ||
    entry.location_id ||
    entry.area_id ||
    entry.plan_id;
  const label =
    type === "none"
      ? "Unassigned"
      : (targetId && targetLabels?.[type]?.[targetId]) || meta.label;
  const href = type !== "none" && targetId ? meta.href(targetId) : null;
  const isAuto = !!entry.task_id;
  const created = new Date(entry.created_at);

  return (
    <article
      data-testid="journal-entry-card"
      className="bg-white border border-rhozly-outline/15 rounded-2xl p-4 flex gap-3"
    >
      {entry.image_url && (
        <img
          src={entry.image_url}
          alt=""
          className="w-20 h-20 rounded-xl object-cover shrink-0 border border-rhozly-outline/10"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-sm text-rhozly-on-surface leading-snug">
            {entry.subject}
          </h3>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(entry)}
              aria-label="Delete entry"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        {entry.description && (
          <p className="text-xs font-medium text-rhozly-on-surface/60 mt-1 line-clamp-3 whitespace-pre-line">
            {entry.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {href ? (
            <Link
              to={href}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/60 hover:bg-rhozly-primary/10 hover:text-rhozly-primary transition-colors"
            >
              {meta.icon}
              {label}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/40">
              {meta.icon}
              {label}
            </span>
          )}
          {isAuto && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700"
              title="Created automatically when you completed a task"
            >
              <Sparkles size={10} /> Auto
            </span>
          )}
          <span className="text-[10px] font-bold text-rhozly-on-surface/30 ml-auto">
            {formatDistanceToNow(created, { addSuffix: true })}
          </span>
        </div>
      </div>
    </article>
  );
}
