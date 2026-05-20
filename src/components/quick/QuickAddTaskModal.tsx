import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Save,
  Calendar as CalendarIcon,
  Droplets,
  Scissors,
  Wheat,
  Shovel,
  Wrench,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { TASK_CATEGORIES, type TaskCategory } from "../../constants/taskCategories";
import { logEvent, EVENT } from "../../events/registry";

interface Props {
  homeId: string;
  /** Pre-fill the date input. Defaults to today (in user's local time). */
  defaultDate?: Date;
  onClose: () => void;
  /** Called after a successful insert; parent should refresh its task list. */
  onSuccess: () => void;
}

const TYPE_ICON: Record<TaskCategory, React.ReactNode> = {
  Watering: <Droplets size={16} />,
  Pruning: <Scissors size={16} />,
  Harvesting: <Wheat size={16} />,
  Maintenance: <Wrench size={16} />,
  Planting: <Shovel size={16} />,
};

function isoFromLocalDate(d: Date): string {
  // Native <input type="date"> uses YYYY-MM-DD in the user's local TZ.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Slim "Add a task" modal for the mobile Quick Access calendar
 * (`/quick/calendar`). Four fields only — title, type, description, due
 * date — and a one-tap Save. Inserts a single one-off `tasks` row with
 * `home_id` set and everything else null/default. Area, plants, plans,
 * recurring schedule, scope toggle all stay deferred to the desktop
 * Task Detail modal.
 *
 * Use the full `AddTaskModal` for any task that needs more than the
 * basics at creation time.
 */
export default function QuickAddTaskModal({
  homeId,
  defaultDate,
  onClose,
  onSuccess,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskCategory>("Maintenance");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string>(() =>
    isoFromLocalDate(defaultDate ?? new Date()),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0 && !!dueDate && !saving;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const handleSave = async () => {
    if (!canSave || !homeId) return;
    setSaving(true);
    setError(null);
    try {
      // Mirror the same insert shape AddTaskModal uses for its one-off path,
      // minus the area/plant/plan/inventory bindings — those stay null and
      // get filled in later from the desktop Task Detail modal.
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData?.user?.id ?? null;

      const { error: insertErr } = await supabase.from("tasks").insert({
        home_id: homeId,
        title: title.trim(),
        type,
        description: description.trim() || null,
        due_date: dueDate,
        status: "Pending",
        scope: "home",
        created_by: createdBy,
      });
      if (insertErr) throw insertErr;

      logEvent(EVENT.TASK_CREATED, {
        type,
        has_description: description.trim().length > 0,
        source: "quick_add",
      });

      toast.success("Task added");
      onSuccess();
      onClose();
    } catch (err: any) {
      Logger.error("QuickAddTaskModal save failed", err, { homeId, type });
      setError(err?.message ?? "Couldn't save the task.");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="quick-add-task-modal"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-task-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-rhozly-bg w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-rhozly-outline/10">
          <div>
            <h2
              id="quick-add-task-title"
              className="font-black text-lg text-rhozly-on-surface tracking-tight"
            >
              Add a task
            </h2>
            <p className="text-xs text-rhozly-on-surface/55 mt-0.5">
              Quick capture — fill the basics now, file later.
            </p>
          </div>
          <button
            type="button"
            data-testid="quick-add-task-close"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="quick-add-task-title-input"
              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1 block"
            >
              What needs doing?
            </label>
            <input
              id="quick-add-task-title-input"
              data-testid="quick-add-task-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Water the new herbs"
              disabled={saving}
              autoFocus
              className="w-full px-4 py-2.5 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 focus:outline-none focus:border-rhozly-primary"
            />
          </div>

          {/* Type picker */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1 block">
              Type
            </label>
            <div
              data-testid="quick-add-task-type-picker"
              className="grid grid-cols-3 sm:grid-cols-5 gap-2"
            >
              {TASK_CATEGORIES.map((cat) => {
                const active = type === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    data-testid={`quick-add-task-type-${cat}`}
                    onClick={() => setType(cat)}
                    disabled={saving}
                    className={`flex flex-col items-center justify-center gap-1 px-2 py-2 min-h-[56px] rounded-xl border text-[11px] font-black uppercase tracking-widest transition ${
                      active
                        ? "bg-rhozly-primary text-white border-rhozly-primary shadow-sm"
                        : "bg-white text-rhozly-on-surface/65 border-rhozly-outline/15 hover:border-rhozly-primary/30"
                    }`}
                  >
                    {TYPE_ICON[cat]}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="quick-add-task-description-input"
              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1 block"
            >
              Notes <span className="text-rhozly-on-surface/40 font-bold normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id="quick-add-task-description-input"
              data-testid="quick-add-task-description-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything you want to remember…"
              disabled={saving}
              className="w-full px-4 py-2.5 rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 focus:outline-none focus:border-rhozly-primary resize-none"
            />
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="quick-add-task-date-input"
              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1 block"
            >
              When
            </label>
            <div className="relative">
              <CalendarIcon
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
              />
              <input
                id="quick-add-task-date-input"
                data-testid="quick-add-task-date-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={saving}
                className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary"
              />
            </div>
          </div>

          {error && (
            <p
              data-testid="quick-add-task-error"
              className="text-xs font-bold text-red-700 px-2"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 pt-3 border-t border-rhozly-outline/10">
          <button
            type="button"
            data-testid="quick-add-task-cancel"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="quick-add-task-save"
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} />
                Save task
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
