import { useCallback, useEffect, useState } from "react";
import { Leaf, Calendar, ArchiveRestore, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { ConfirmModal } from "./ConfirmModal";

interface LifecycleEntry {
  id: string;
  subject: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

interface Props {
  homeId: string;
  instance: any;
  /** Fired after a successful restore so the host can refresh + close the tab. */
  onRestored: () => void;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Senescence tab — the instance's end-of-life record in one place, instead of
 * buried among general journal entries. Renders only for ended instances (the
 * host hides the tab otherwise). Restore uses the exact PlantInstancesTab
 * semantics: null the EoL triple, status→Planted, journal the round trip,
 * re-fire generate-tasks.
 */
export default function InstanceSenescenceTab({ homeId, instance, onRestored }: Props) {
  const [entries, setEntries] = useState<LifecycleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const name = instance.identifier || instance.nickname || instance.plant_name || "this plant";

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryErr } = await supabase
        .from("plant_journals")
        .select("id, subject, description, image_url, created_at")
        .eq("inventory_item_id", instance.id)
        .or("subject.like.Lifecycle complete%,subject.like.Restored from Senescence%")
        .order("created_at", { ascending: false });
      if (queryErr) throw queryErr;
      setEntries((data ?? []) as LifecycleEntry[]);
    } catch (err: any) {
      Logger.error("InstanceSenescenceTab fetch failed", err, { instanceId: instance.id });
      setError(err?.message ?? "Couldn't load the senescence record.");
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const closingPhotoUrl =
    entries.find((e) => e.subject.startsWith("Lifecycle complete") && e.image_url)?.image_url ?? null;

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({ ended_at: null, was_natural_end: null, end_summary: null, status: "Planted" })
        .eq("id", instance.id);
      if (updateErr) throw updateErr;
      await supabase.from("plant_journals").insert({
        home_id: homeId,
        inventory_item_id: instance.id,
        subject: "Restored from Senescence",
        description: `${name} is back in active care.`,
      });
      supabase.functions
        .invoke("generate-tasks", { body: { home_id: homeId } })
        .catch((err) => Logger.error("InstanceSenescenceTab restore generate-tasks failed", err, { instanceId: instance.id }));
      toast.success(`Restored ${name} to active plants.`);
      setConfirmOpen(false);
      onRestored();
    } catch (err: any) {
      Logger.error("InstanceSenescenceTab restore failed", err, { instanceId: instance.id });
      toast.error("Couldn't restore — try again.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div data-testid="instance-senescence-tab" className="space-y-4">
      {/* The record — end date, nature of the end, closing note */}
      <div className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="p-2 rounded-xl bg-rhozly-primary/10 text-rhozly-primary">
            <Leaf size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-rhozly-on-surface text-sm">Lifecycle complete</p>
            <p className="text-xs font-bold text-rhozly-on-surface/50 flex items-center gap-1 mt-0.5">
              <Calendar size={12} /> Ended {shortDate(instance.ended_at)}
              {instance.planted_at && <> · planted {shortDate(instance.planted_at)}</>}
            </p>
          </div>
          <span
            data-testid="senescence-end-badge"
            className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${
              instance.was_natural_end
                ? "bg-emerald-100 text-emerald-700"
                : instance.was_natural_end === false
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rhozly-surface text-rhozly-on-surface/50"
            }`}
          >
            {instance.was_natural_end
              ? "Natural end"
              : instance.was_natural_end === false
                ? "Cut short"
                : "End recorded"}
          </span>
        </div>
        {instance.end_summary && (
          <p
            data-testid="senescence-end-summary"
            className="text-sm font-bold text-rhozly-on-surface/70 leading-snug border-t border-rhozly-outline/10 pt-3"
          >
            {instance.end_summary}
          </p>
        )}
      </div>

      {/* Closing photo, when one was captured with the lifecycle entry */}
      {closingPhotoUrl && (
        <img
          data-testid="senescence-closing-photo"
          src={closingPhotoUrl}
          alt={`Closing photo of ${name}`}
          className="w-full max-h-64 object-cover rounded-2xl border border-rhozly-outline/15"
        />
      )}

      {/* Lifecycle timeline — the same journal rows, pre-filtered */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin text-rhozly-on-surface/30" size={22} />
        </div>
      ) : error ? (
        <p className="text-sm font-bold text-rhozly-error flex items-center gap-1.5">
          <AlertCircle size={14} /> {error}
        </p>
      ) : entries.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
            Lifecycle history
          </p>
          <ul className="space-y-2" data-testid="senescence-timeline">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 px-3 py-2.5"
              >
                <p className="text-xs font-black text-rhozly-on-surface">{e.subject}</p>
                {e.description && (
                  <p className="text-xs font-bold text-rhozly-on-surface/60 mt-0.5 leading-snug">{e.description}</p>
                )}
                <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1">{shortDate(e.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Restore — reversible, confirm first (an accidental tap would re-fire routines) */}
      <button
        type="button"
        data-testid="senescence-restore"
        onClick={() => setConfirmOpen(true)}
        disabled={restoring}
        className="w-full py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/70 hover:border-rhozly-primary/40 hover:text-rhozly-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {restoring ? <Loader2 className="animate-spin" size={16} /> : <ArchiveRestore size={16} />}
        Restore to active care
      </button>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRestore}
        title={`Restore ${name}?`}
        description="This clears the end-of-life record, sets the instance back to Planted, and resumes its care routines. The journal keeps the full history."
        confirmText="Restore"
        isLoading={restoring}
        isDestructive={false}
      />
    </div>
  );
}
