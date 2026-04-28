import React, { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface BulkConfigModalProps {
  homeId: string;
  currentAreaId: string;
  selectedCount: number;
  isProcessing: boolean;
  onClose: () => void;
  onSave: (payload: any) => void;
}

export default function BulkConfigModal({
  homeId,
  currentAreaId,
  selectedCount,
  isProcessing,
  onClose,
  onSave,
}: BulkConfigModalProps) {
  const [form, setForm] = useState({
    status: "",
    growth_state: "",
    planted_at: "",
    location_id: "",
    area_id: "",
  });

  const [locs, setLocs] = useState<any[]>([]);
  const [locsLoading, setLocsLoading] = useState(false);
  const [locsError, setLocsError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLocs = async () => {
      setLocsLoading(true);
      setLocsError(false);
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, areas(id, name)")
        .eq("home_id", homeId);
      setLocsLoading(false);
      if (error) {
        setLocsError(true);
        toast.error("Could not load locations. Please try again.");
        return;
      }
      if (data) setLocs(data);
    };
    fetchLocs();
  }, [homeId]);

  // Focus trap implementation
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element on mount
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    modal.addEventListener("keydown", handleKeyDown);
    return () => modal.removeEventListener("keydown", handleKeyDown);
  }, [locs, form.location_id]);

  const activeAreas = form.location_id
    ? locs.find((l) => l.id === form.location_id)?.areas || []
    : [];

  const handleSubmit = () => {
    const payload: any = {};
    if (form.status) payload.status = form.status;
    if (form.growth_state) payload.growth_state = form.growth_state;
    if (form.planted_at)
      payload.planted_at = new Date(form.planted_at).toISOString();
    if (form.area_id) {
      payload.location_id = form.location_id;
      payload.area_id = form.area_id;
    }

    if (Object.keys(payload).length === 0) {
      toast.error("No changes made.");
      return;
    }
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in-95">
      <div
        ref={modalRef}
        aria-labelledby="bulk-config-title"
        aria-describedby="bulk-config-description"
        className="bg-rhozly-surface-lowest w-full max-w-md rounded-2xl p-8 shadow-2xl flex flex-col border border-rhozly-outline/10"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 id="bulk-config-title" className="text-2xl font-black text-rhozly-on-surface leading-tight">
              Configure Plants
            </h3>
            <p id="bulk-config-description" className="text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest mt-1">
              Updating {selectedCount} items
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 bg-rhozly-surface rounded-full hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="bulk-status"
                className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 block mb-1"
              >
                Status
              </label>
              <select
                id="bulk-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full p-3 bg-rhozly-surface-low rounded-xl text-sm font-bold border border-rhozly-outline/30 outline-none focus:border-rhozly-primary"
              >
                <option value="">-- No Change --</option>
                <option value="Unplanted">Unplanted / Staged</option>
                <option value="Planted">Planted Active</option>
                <option value="Archived">Archived / History</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="bulk-growth-state"
                className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 block mb-1"
              >
                Growth Stage
              </label>
              <select
                id="bulk-growth-state"
                value={form.growth_state}
                onChange={(e) =>
                  setForm({ ...form, growth_state: e.target.value })
                }
                className="w-full p-3 bg-rhozly-surface-low rounded-xl text-sm font-bold border border-rhozly-outline/30 outline-none focus:border-rhozly-primary"
              >
                <option value="">-- No Change --</option>
                <option value="Seedling">Seedling / Sprout</option>
                <option value="Vegetative">Vegetative</option>
                <option value="Flowering">Flowering</option>
                <option value="Fruiting">Fruiting</option>
                <option value="Dormant">Dormant</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="bulk-planted-at"
              className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 block mb-1"
            >
              Planted Date
            </label>
            <input
              id="bulk-planted-at"
              type="date"
              value={form.planted_at}
              onChange={(e) => setForm({ ...form, planted_at: e.target.value })}
              className="w-full p-3 bg-rhozly-surface-low rounded-xl text-sm font-bold border border-rhozly-outline/30 outline-none focus:border-rhozly-primary"
            />
          </div>

          <div className="p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/20 space-y-3 mt-2">
            <p className="text-[10px] font-black uppercase text-rhozly-primary tracking-widest">
              Move Location (Optional)
            </p>
            <div>
              <select
                id="bulk-location"
                value={form.location_id}
                disabled={locsLoading}
                onChange={(e) =>
                  setForm({ ...form, location_id: e.target.value, area_id: "" })
                }
                className="w-full p-3 bg-rhozly-surface-lowest rounded-xl text-sm font-bold border border-rhozly-outline/30 outline-none focus:border-rhozly-primary disabled:opacity-50"
              >
                <option value="">
                  {locsLoading ? "Loading locations…" : "-- Keep Current Location --"}
                </option>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {locsLoading && (
                <p className="flex items-center gap-1.5 text-xs text-rhozly-on-surface/50 mt-1.5 ml-1">
                  <Loader2 size={12} className="animate-spin" />
                  Fetching locations…
                </p>
              )}
              {locsError && (
                <p className="text-xs text-red-600 mt-1.5 ml-1">
                  Failed to load locations. Please close and reopen.
                </p>
              )}
            </div>
            <div>
              <select
                id="bulk-area"
                value={form.area_id}
                onChange={(e) => setForm({ ...form, area_id: e.target.value })}
                disabled={!form.location_id}
                className="w-full p-3 bg-rhozly-surface-lowest rounded-xl text-sm font-bold border border-rhozly-outline/30 outline-none focus:border-rhozly-primary disabled:opacity-50"
              >
                <option value="">-- Select Area --</option>
                {activeAreas.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isProcessing}
          className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:bg-rhozly-primary-container transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            "Apply Changes"
          )}
        </button>
      </div>
    </div>
  );
}
