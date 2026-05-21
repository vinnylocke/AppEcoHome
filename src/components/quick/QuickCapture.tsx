import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Save,
  Loader2,
  Sprout,
  Trash2,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import PhotoUploader from "../PhotoUploader";
import AssignToPlantSheet from "./AssignToPlantSheet";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  useUnassignedJournals,
  type UnassignedJournalEntry,
} from "../../hooks/useUnassignedJournals";

interface Props {
  homeId: string;
}

/**
 * Auto-subject builder — human-readable date format locked in for Wave 4.
 * Example: "Capture · 20 May, 14:32".
 */
function buildAutoSubject(now = new Date()): string {
  const label = now.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Capture · ${label}`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function QuickCapture({ homeId }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { entries, loading, error, refresh, assign, remove } =
    useUnassignedJournals(homeId);

  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningEntry, setAssigningEntry] =
    useState<UnassignedJournalEntry | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canSave = !!imageUrl || description.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    if (!homeId) return;
    setSaving(true);
    try {
      const subject = buildAutoSubject();
      const { error: insertErr } = await supabase
        .from("plant_journals")
        .insert({
          home_id: homeId,
          inventory_item_id: null,
          subject,
          description: description.trim() || null,
          image_url: imageUrl,
        });
      if (insertErr) throw insertErr;

      logEvent(EVENT.JOURNAL_ENTRY_ADDED, {
        inventory_item_id: null,
        has_image: !!imageUrl,
        linked_task_id: null,
        source: "quick_capture",
      });

      toast.success("Saved to your captures");
      setDescription("");
      setImageUrl(null);
      await refresh();
    } catch (err: any) {
      Logger.error("Quick Capture save failed", err, { homeId });
      toast.error(err?.message ?? "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (entryId: string, inventoryItemId: string) => {
    await assign(entryId, inventoryItemId);
    toast.success("Assigned to plant");
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await remove(pendingDeleteId);
      toast.success("Capture deleted");
      setPendingDeleteId(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      data-testid="quick-capture-screen"
      // Wave 10 — push content past the floating menu button.
      style={{ paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))" }}
      className="h-full w-full max-w-2xl mx-auto px-4 sm:px-6 pb-4 flex flex-col"
    >
      {/* Back chrome */}
      <header className="flex items-center justify-between mb-3">
        <button
          type="button"
          data-testid="quick-capture-back"
          onClick={() => navigate("/quick")}
          className="inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2 text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-primary transition"
          aria-label="Back to Quick Access"
        >
          <ChevronLeft size={18} />
          Quick
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70">
          Quick Capture
        </span>
      </header>

      {!isMobile && (
        <div
          data-testid="quick-capture-desktop-banner"
          className="flex items-start gap-3 mb-4 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900"
        >
          <Info size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs font-bold leading-snug">
            This is the mobile shortcut screen — captures from your phone show up here, and you can assign them on either device.
          </p>
        </div>
      )}

      {/* Composer */}
      <section
        data-testid="quick-capture-composer"
        className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-sm p-5 sm:p-6 mb-5"
      >
        <h2 className="font-black text-base sm:text-lg text-rhozly-on-surface tracking-tight mb-3">
          What did you notice?
        </h2>

        <PhotoUploader
          bucket="plant-images"
          pathPrefix="plant-photos"
          value={imageUrl}
          onChange={(url) => setImageUrl(url ?? null)}
          label="Add a photo"
          aspectClass="h-44"
          testIdPrefix="quick-capture-photo"
          onUploadStart={() => setUploading(true)}
          onUploadEnd={() => setUploading(false)}
          disabled={saving}
        />

        <textarea
          data-testid="quick-capture-description"
          rows={3}
          placeholder="Jot a note — e.g. 'yellow spots on the lower leaves'."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          className="mt-3 w-full p-4 bg-rhozly-surface-low/40 rounded-2xl font-bold border border-transparent focus:border-rhozly-primary focus:bg-white outline-none text-sm resize-none"
        />

        <button
          type="button"
          data-testid="quick-capture-save"
          onClick={handleSave}
          disabled={!canSave || saving || uploading}
          className="mt-3 w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:opacity-90 disabled:opacity-40 transition flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Saving…
            </>
          ) : (
            <>
              <Save size={18} />
              Save capture
            </>
          )}
        </button>

        {!canSave && (
          <p className="mt-2 text-[11px] text-rhozly-on-surface/45 text-center">
            Add a photo or write a note to save.
          </p>
        )}
      </section>

      {/* Recent captures */}
      <section data-testid="quick-capture-recent" className="flex-1 min-h-0">
        <h3 className="font-black text-xs uppercase tracking-widest text-rhozly-on-surface/60 mb-3 px-1">
          Recent captures{entries.length > 0 ? ` (${entries.length})` : ""}
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/40 px-4 py-3 rounded-2xl bg-rhozly-surface-low/40">
            <Loader2 className="animate-spin" size={14} />
            Loading…
          </div>
        ) : error ? (
          <div className="text-xs text-red-700 px-4 py-3 rounded-2xl bg-red-50 border border-red-100">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div
            data-testid="quick-capture-empty"
            className="text-center text-sm text-rhozly-on-surface/45 px-4 py-6 rounded-2xl bg-rhozly-surface-low/40 border border-dashed border-rhozly-outline/15"
          >
            No captures yet — they'll appear here, waiting to be assigned.
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-testid={`quick-capture-entry-${entry.id}`}
                className="bg-white border border-rhozly-outline/15 rounded-2xl p-3 flex items-start gap-3 shadow-sm"
              >
                {entry.image_url ? (
                  <img
                    src={entry.image_url}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0 bg-rhozly-surface-low"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl shrink-0 bg-rhozly-surface-low border border-rhozly-outline/10 flex items-center justify-center text-rhozly-on-surface/30">
                    <Sprout size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-rhozly-on-surface truncate">
                    {entry.subject}
                  </p>
                  {entry.description && (
                    <p className="text-xs text-rhozly-on-surface/70 leading-snug line-clamp-2 mt-0.5">
                      {entry.description}
                    </p>
                  )}
                  <p className="text-[10px] text-rhozly-on-surface/40 mt-1">
                    {formatRelative(entry.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    data-testid={`quick-capture-assign-${entry.id}`}
                    onClick={() => setAssigningEntry(entry)}
                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:opacity-80 px-2 py-1 transition"
                  >
                    Assign →
                  </button>
                  <button
                    type="button"
                    data-testid={`quick-capture-delete-${entry.id}`}
                    onClick={() => setPendingDeleteId(entry.id)}
                    className="text-rhozly-on-surface/30 hover:text-red-600 p-1 transition"
                    aria-label="Delete capture"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assign sheet */}
      {assigningEntry && (
        <AssignToPlantSheet
          homeId={homeId}
          entryId={assigningEntry.id}
          entrySubject={assigningEntry.subject}
          onAssign={handleAssign}
          onClose={() => setAssigningEntry(null)}
        />
      )}

      {/* Delete confirm */}
      {pendingDeleteId && (
        <div
          data-testid="quick-capture-delete-confirm"
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deleting && setPendingDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-rhozly-bg w-full max-w-sm rounded-3xl shadow-2xl border border-rhozly-outline/10 p-5"
          >
            <h3 className="font-black text-rhozly-on-surface mb-2">
              Delete this capture?
            </h3>
            <p className="text-sm text-rhozly-on-surface/65 mb-4 leading-snug">
              Once deleted, the photo and note can't be recovered.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="quick-capture-delete-cancel"
                onClick={() => setPendingDeleteId(null)}
                disabled={deleting}
                className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="quick-capture-delete-confirm-btn"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-5 py-2.5 min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-black hover:opacity-90 disabled:opacity-50 transition"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
