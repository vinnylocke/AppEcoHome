import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, Trash2, Sprout, MapPin, Square, FileText, Globe, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { JournalEntry, JournalTargetType } from "../../types";
import { getEntryTargetType } from "../../hooks/useGlobalJournal";
import JournalComposer from "./JournalComposer";

interface Props {
  entry: JournalEntry;
  homeId: string;
  /** id → label map so the target chip reads "Tomato (Greenhouse)" etc. */
  targetLabels?: Partial<Record<JournalTargetType, Record<string, string>>>;
  onClose: () => void;
  /** Called after a successful in-modal edit so the parent can refresh. */
  onUpdated?: () => void;
  /** Parent owns the delete-confirm flow. */
  onDelete?: (entry: JournalEntry) => void;
}

const TYPE_ICON: Record<JournalTargetType, ReactNode> = {
  plant: <Sprout size={12} />,
  location: <MapPin size={12} />,
  area: <Square size={12} />,
  plan: <FileText size={12} />,
  none: <Globe size={12} />,
};
const TYPE_LABEL: Record<JournalTargetType, string> = {
  plant: "Plant",
  location: "Location",
  area: "Area",
  plan: "Plan",
  none: "Unassigned",
};

/**
 * Read-only View of a single journal entry (#9). Tapping a JournalEntryCard
 * opens this; the Edit button flips it into the shared JournalComposer in
 * edit mode. Keeps view and edit as one modal so the surrounding list stays put.
 */
export default function JournalEntryModal({
  entry,
  homeId,
  targetLabels,
  onClose,
  onUpdated,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const type = getEntryTargetType(entry);
  const targetId =
    entry.inventory_item_id || entry.location_id || entry.area_id || entry.plan_id;
  const label =
    type === "none"
      ? "Unassigned"
      : (targetId && targetLabels?.[type]?.[targetId]) || TYPE_LABEL[type];
  const isAuto = !!entry.task_id;
  const created = new Date(entry.created_at);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="journal-entry-modal"
    >
      <div className="bg-rhozly-surface w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {editing ? (
          <div className="overflow-y-auto p-3 sm:p-4">
            <JournalComposer
              homeId={homeId}
              entry={entry}
              onSaved={() => { setEditing(false); onUpdated?.(); }}
              onClose={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 flex items-center gap-2 p-3 border-b border-rhozly-outline/10 bg-white">
              <h2 className="min-w-0 flex-1 font-black text-base text-rhozly-on-surface leading-snug truncate">
                {entry.subject}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="journal-entry-edit"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/20 transition-colors"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                data-testid="journal-entry-close"
                className="shrink-0 p-2 rounded-lg text-rhozly-on-surface/60 hover:bg-rhozly-surface-low"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {entry.image_url && (
                <img
                  src={entry.image_url}
                  alt=""
                  className="w-full max-h-80 object-cover rounded-2xl border border-rhozly-outline/10"
                />
              )}
              {entry.description ? (
                <p className="text-sm font-medium text-rhozly-on-surface/80 leading-relaxed whitespace-pre-line">
                  {entry.description}
                </p>
              ) : (
                <p className="text-sm italic text-rhozly-on-surface/40">No description.</p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rhozly-surface-low text-rhozly-on-surface/60">
                  {TYPE_ICON[type]} {label}
                </span>
                {isAuto && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700">
                    <Sparkles size={10} /> Auto
                  </span>
                )}
                <span className="text-[10px] font-bold text-rhozly-on-surface/30 ml-auto">
                  {formatDistanceToNow(created, { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Footer — delete (parent owns the confirm) */}
            {onDelete && (
              <div className="shrink-0 flex items-center p-3 border-t border-rhozly-outline/10 bg-white">
                <button
                  type="button"
                  onClick={() => { onDelete(entry); onClose(); }}
                  data-testid="journal-entry-delete"
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-black"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
