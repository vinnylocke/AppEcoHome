// Home-level "default run window" for automations. An automation whose
// condition tree has no time/date condition of its own only acts inside this
// window (default 08:00–20:00) — set by `evaluate-automations`. Editing is
// gated by `automations.manage`; disable the window for 24/7 behaviour.

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Clock, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";

/** Postgres `time` comes back "HH:MM:SS" — `<input type="time">` wants "HH:MM". */
const toHHMM = (t: string | null | undefined, fallback: string): string => {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? "");
  return m ? `${m[1]}:${m[2]}` : fallback;
};

export default function AutomationDefaultsCard({ homeId, canManage }: { homeId: string; canManage: boolean }) {
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("homes")
        .select("automation_window_start, automation_window_end, automation_window_enabled")
        .eq("id", homeId)
        .maybeSingle();
      if (!cancelled && data) {
        setStart(toHHMM(data.automation_window_start as string | null, "08:00"));
        setEnd(toHHMM(data.automation_window_end as string | null, "20:00"));
        setEnabled((data.automation_window_enabled as boolean | null) !== false);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("homes")
      .update({ automation_window_start: start, automation_window_end: end, automation_window_enabled: enabled })
      .eq("id", homeId);
    setSaving(false);
    if (error) toast.error("Couldn't save default window");
    else toast.success("Default run window saved");
  };

  if (loading) return null;

  const overnight = enabled && end <= start;

  return (
    <div data-testid="automation-defaults-card" className="mb-5 rounded-2xl border border-rhozly-outline/20 bg-rhozly-surface-lowest p-4">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={15} className="text-rhozly-primary" />
        <h3 className="font-bold text-rhozly-on-surface text-sm">Default run window</h3>
      </div>
      <p className="text-xs text-rhozly-on-surface-variant mb-3">
        Automations without their own time condition only act inside these hours — so you don't get surprise overnight watering.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-rhozly-on-surface">
          <input data-testid="automation-window-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" disabled={!canManage} />
          Enabled
        </label>
        <span className="text-xs text-rhozly-on-surface-variant">from</span>
        <input data-testid="automation-window-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canManage || !enabled}
          className="rounded-lg border border-rhozly-outline/30 p-1.5 text-sm disabled:opacity-50" />
        <span className="text-xs text-rhozly-on-surface-variant">to</span>
        <input data-testid="automation-window-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canManage || !enabled}
          className="rounded-lg border border-rhozly-outline/30 p-1.5 text-sm disabled:opacity-50" />
        {overnight && <span className="text-[11px] font-semibold text-amber-600">(overnight)</span>}
        {canManage && (
          <button data-testid="automation-window-save" onClick={save} disabled={saving}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rhozly-primary text-white text-xs font-bold disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
          </button>
        )}
      </div>
    </div>
  );
}
