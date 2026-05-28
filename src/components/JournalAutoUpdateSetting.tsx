import React, { useEffect, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { TASK_CATEGORIES } from "../constants/taskCategories";
import type { TaskCategory } from "../constants/taskCategories";

interface Props {
  userId: string;
}

/**
 * Auto-update Journal preference card.
 *
 * Renders one toggle per task category in TASK_CATEGORIES. Adding a new
 * category later automatically shows up here — no schema change required.
 * The list is stored on `user_profiles.auto_update_journal_categories`
 * as a Postgres text[] (one row, persisted server-side so it survives
 * device switches).
 */
export default function JournalAutoUpdateSetting({ userId }: Props) {
  const [enabled, setEnabled] = useState<Set<TaskCategory>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("auto_update_journal_categories")
          .eq("uid", userId)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const list: string[] = data?.auto_update_journal_categories ?? [];
        setEnabled(new Set(list as TaskCategory[]));
      } catch (err) {
        Logger.error("JournalAutoUpdateSetting: load failed", err, { userId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = async (next: Set<TaskCategory>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ auto_update_journal_categories: Array.from(next) })
        .eq("uid", userId);
      if (error) throw error;
    } catch (err: any) {
      Logger.error("JournalAutoUpdateSetting: save failed", err, { userId });
      toast.error("Couldn't save preference. Try again.");
      // Revert local state on failure.
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (cat: TaskCategory) => {
    const next = new Set(enabled);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    const prev = enabled;
    setEnabled(next);
    try {
      await persist(next);
    } catch {
      setEnabled(prev);
    }
  };

  return (
    <div
      className="bg-white border border-rhozly-outline/20 rounded-2xl p-5 space-y-4"
      data-testid="journal-auto-update-setting"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary">
          <BookOpen size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-rhozly-on-surface">
            Auto-update journal
          </h3>
          <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">
            When you complete a task in any category below, Rhozly will quietly add an entry to your garden journal — perfect for keeping a running record without lifting a finger.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs font-bold text-rhozly-on-surface/40">
          <Loader2 size={14} className="animate-spin" /> Loading preferences…
        </div>
      ) : (
        <ul className="space-y-1.5">
          {TASK_CATEGORIES.map((cat) => {
            const active = enabled.has(cat);
            return (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => toggle(cat)}
                  disabled={saving}
                  aria-pressed={active}
                  data-testid={`journal-auto-update-${cat.toLowerCase()}`}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors text-sm font-bold ${
                    active
                      ? "bg-rhozly-primary/5 border-rhozly-primary/30 text-rhozly-on-surface"
                      : "bg-rhozly-surface-low border-transparent text-rhozly-on-surface/60 hover:border-rhozly-outline/30"
                  } disabled:opacity-50`}
                >
                  <span>{cat}</span>
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${
                      active
                        ? "bg-rhozly-primary border-rhozly-primary text-white"
                        : "bg-white border-rhozly-outline/30 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {enabled.size === 0 && !loading && (
        <p className="text-[10px] font-bold text-rhozly-on-surface/40 italic">
          Auto-update is off. Pick a category above to start logging automatically.
        </p>
      )}
    </div>
  );
}
