import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Droplets,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  NotebookPen,
  TriangleAlert,
  Sparkles,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { bandLabel, type WalkPlant, type WalkPlantInstance, type WalkTask } from "../../lib/gardenWalk";
import type { WalkVisitOutcome } from "../../services/walkService";
import PhotoUploader from "../PhotoUploader";
import WalkTaskRow from "./WalkTaskRow";

interface Props {
  homeId: string;
  userId: string;
  aiEnabled: boolean;
  plant: WalkPlant;
  /** RHO-17 — this plant's tasks (real + ghost), actionable in-card. */
  tasks: WalkTask[];
  /** RHO-17 — enclosing section label for the header ("Raised Bed A"). */
  sectionLabel?: string | null;
  progressIndex: number;   // zero-based
  progressTotal: number;
  onOutcome: (outcome: WalkVisitOutcome) => void;
  /** RHO-17 — a task on this card was completed (summary + visit row). */
  onTaskCompleted?: (task: WalkTask) => void;
  onStop: () => void;
}

type ActiveSheet = "snap" | "note" | null;

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function autoSubject(prefix: string): string {
  const now = new Date();
  const label = now.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${prefix} · ${label}`;
}

/**
 * RHO-18 — "which plant(s)?" selector shown in the Snap / Note sheets when a
 * card groups several instances. Multi-select, defaulting to all — the user
 * can narrow to one (uncheck the rest) or keep all.
 */
function InstancePicker({
  instances,
  selected,
  onToggle,
}: {
  instances: WalkPlantInstance[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div data-testid="walk-instance-picker" className="mb-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1.5">
        Which plant{instances.length === 1 ? "" : "s"}?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {instances.map((inst) => {
          const on = selected.includes(inst.inventoryItemId);
          return (
            <button
              key={inst.inventoryItemId}
              type="button"
              data-testid={`walk-instance-pick-${inst.inventoryItemId}`}
              aria-pressed={on}
              onClick={() => onToggle(inst.inventoryItemId)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-black border transition ${
                on
                  ? "bg-rhozly-primary text-white border-rhozly-primary"
                  : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"
              }`}
            >
              {on && <Check size={12} />}
              <span className="truncate max-w-[10rem]">{inst.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One full-screen card per plant during a Garden Walk. The card shows a
 * hero photo + context strip (last note / ailments / due tasks / fresh
 * insights) + a sticky bottom action bar (Snap / Note / All good /
 * Skip / Stop). Snap and Note open inline sheets — the user never
 * leaves the walk.
 */
export default function WalkPlantCard({
  homeId,
  userId,
  aiEnabled,
  plant,
  tasks,
  sectionLabel,
  progressIndex,
  progressTotal,
  onOutcome,
  onTaskCompleted,
  onStop,
}: Props) {
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const [snapUploading, setSnapUploading] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // RHO-18 — grouped card: same-plant, same-area instances collapse into one
  // card. Snap/Note can target one, several, or all of them (default: all).
  const instances = plant.instances ?? [];
  const isGroup = (plant.instanceCount ?? instances.length) > 1;
  const [instancesOpen, setInstancesOpen] = useState(false);
  const [captureTargets, setCaptureTargets] = useState<string[]>([]);

  const openSheet = (s: Exclude<ActiveSheet, null>) => {
    setCaptureTargets(
      isGroup ? instances.map((i) => i.inventoryItemId) : [plant.inventoryItemId],
    );
    setSheet(s);
  };
  const toggleTarget = (id: string) =>
    setCaptureTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  // The instances a capture writes to — falls back to the representative so a
  // non-group card (or an accidental empty selection) always writes one row.
  const effectiveTargets = () =>
    captureTargets.length > 0 ? captureTargets : [plant.inventoryItemId];

  // RHO-6: on a wide landscape screen the Snap/Note sheets mount as a
  // `fixed inset-0` overlay whose actionable content is top-aligned, so
  // nothing draws the eye — it looks like the tap did nothing. Scroll the
  // sheet's own scroll body to the top and move focus into it when it
  // opens. The Note sheet already autoFocuses its textarea; the Snap
  // sheet has no natural focus target, so we focus its scroll body.
  const snapSheetBodyRef = useRef<HTMLDivElement | null>(null);
  const noteSheetBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (sheet === null) return;
    const body = sheet === "snap" ? snapSheetBodyRef.current : noteSheetBodyRef.current;
    if (!body) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    body.scrollIntoView({ block: "start", behavior: prefersReducedMotion ? "auto" : "smooth" });
    body.scrollTop = 0;
    // The Note sheet's textarea autoFocuses itself — don't steal focus
    // from it (or fight PhotoUploader's file-input focus in the Snap
    // sheet). Focus the scroll body only for the Snap sheet, so keyboard
    // users land inside the newly-mounted section.
    if (sheet === "snap") body.focus({ preventScroll: true });
  }, [sheet]);

  const closeSheets = () => {
    setSheet(null);
    setSnapUrl(null);
    setNoteText("");
  };

  // ── Snap action — opens an uploader → writes a journal row → advances ──
  const handleSnapSave = async () => {
    if (!snapUrl) return;
    setSnapUploading(true);
    try {
      // RHO-18 — one journal row per selected instance so a photo of a
      // specific plant in the group files against the right inventory item.
      const targets = effectiveTargets();
      const { error } = await supabase.from("plant_journals").insert(
        targets.map((inventoryItemId) => ({
          home_id: homeId,
          inventory_item_id: inventoryItemId,
          subject: autoSubject("Garden Walk photo"),
          description: null,
          image_url: snapUrl,
          task_id: null,
        })),
      );
      if (error) throw error;
      onOutcome("snapped");
      closeSheets();
    } catch (err: unknown) {
      Logger.error("WalkPlantCard snap save failed", err, {
        inventoryItemId: plant.inventoryItemId,
      });
      toast.error("Couldn't save the photo — try again.");
    } finally {
      setSnapUploading(false);
    }
  };

  // ── Note action — quick journal text + optional image ─────────────────
  const handleNoteSave = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      // RHO-18 — one journal row per selected instance (see handleSnapSave).
      const targets = effectiveTargets();
      const { error } = await supabase.from("plant_journals").insert(
        targets.map((inventoryItemId) => ({
          home_id: homeId,
          inventory_item_id: inventoryItemId,
          subject: autoSubject("Garden Walk note"),
          description: noteText.trim(),
          image_url: null,
          task_id: null,
        })),
      );
      if (error) throw error;
      onOutcome("noted");
      closeSheets();
    } catch (err: unknown) {
      Logger.error("WalkPlantCard note save failed", err, {
        inventoryItemId: plant.inventoryItemId,
      });
      toast.error("Couldn't save the note — try again.");
    } finally {
      setNoteSaving(false);
    }
  };

  const band = bandLabel(plant.band);
  const lastNoteRel = formatRelative(plant.lastJournalAt);
  const heroUrl = plant.lastJournalImageUrl ?? plant.thumbnailUrl ?? null;

  return (
    <div
      data-testid="walk-card"
      className="h-full w-full flex flex-col bg-rhozly-bg"
    >
      {/* Header — progress + stop */}
      <header
        data-testid="walk-card-header"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        // pl-14 keeps "Step N of M" clear of the focus-mode floating burger
        // (top-left) now that /walk is focus-mode on every viewport (RHO-18).
        className="shrink-0 pl-14 pr-4 pb-2 flex items-center justify-between gap-2"
      >
        <div
          data-testid="walk-card-progress"
          className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/55"
        >
          Step {progressIndex + 1} of {progressTotal}
          {sectionLabel && (
            <span
              data-testid="walk-card-section-label"
              className="text-rhozly-on-surface/35"
            >
              {" "}· {sectionLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="walk-card-stop"
          onClick={onStop}
          aria-label="Stop walk"
          className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition"
        >
          <X size={18} />
        </button>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {/* Hero image */}
        <div
          data-testid="walk-card-hero"
          className="rounded-3xl overflow-hidden aspect-video bg-rhozly-primary/5 mb-4"
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt={plant.plantName}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-rhozly-primary/40">
              <Leaf size={32} />
            </div>
          )}
        </div>

        {/* Name + area */}
        <h2
          data-testid="walk-card-name"
          className="font-display font-black text-rhozly-on-surface text-2xl leading-tight"
        >
          {plant.plantName}
        </h2>
        {plant.scientificName && (
          <p className="text-xs font-bold italic text-rhozly-on-surface/45 mt-0.5">
            {plant.scientificName}
          </p>
        )}
        {plant.areaName && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
            <MapPin size={11} />
            {plant.areaName}
            {plant.locationName && (
              <span className="text-rhozly-on-surface/40">· {plant.locationName}</span>
            )}
          </div>
        )}

        {/* RHO-18 — grouped card: count chip + collapsible per-instance list */}
        {isGroup && (
          <div className="mt-3">
            <button
              type="button"
              data-testid="walk-card-instances-toggle"
              onClick={() => setInstancesOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 transition"
            >
              <Layers size={12} />
              {plant.instanceCount ?? instances.length} plants
              <ChevronDown
                size={12}
                className={`transition-transform ${instancesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {instancesOpen && (
              <ul
                data-testid="walk-card-instances"
                className="mt-2 space-y-1.5 rounded-2xl bg-white border border-rhozly-outline/15 p-2"
              >
                {instances.map((inst) => {
                  const instBand = bandLabel(inst.band);
                  return (
                    <li
                      key={inst.inventoryItemId}
                      data-testid={`walk-card-instance-${inst.inventoryItemId}`}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-rhozly-surface-lowest"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/85 truncate">
                        <Leaf size={12} className="shrink-0 text-rhozly-primary/60" />
                        <span className="truncate">{inst.label}</span>
                      </span>
                      {instBand && (
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            inst.band === "critical"
                              ? "bg-rose-100 text-rose-700"
                              : inst.band === "overdue"
                              ? "bg-amber-100 text-amber-800"
                              : inst.band === "due_today"
                              ? "bg-sky-100 text-sky-800"
                              : inst.band === "fresh_hit"
                              ? "bg-violet-100 text-violet-800"
                              : "bg-rhozly-surface-low text-rhozly-on-surface/50"
                          }`}
                        >
                          {instBand}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Band chip */}
        {band && (
          <div
            data-testid="walk-card-band"
            className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
              plant.band === "critical"
                ? "bg-rose-100 text-rose-700 border border-rose-200"
                : plant.band === "overdue"
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : plant.band === "due_today"
                ? "bg-sky-100 text-sky-800 border border-sky-200"
                : plant.band === "fresh_hit"
                ? "bg-violet-100 text-violet-800 border border-violet-200"
                : "bg-rhozly-surface-low text-rhozly-on-surface/55 border border-rhozly-outline/15"
            }`}
          >
            {plant.band === "critical" && <TriangleAlert size={11} />}
            {plant.band === "fresh_hit" && <Sparkles size={11} />}
            {band}
          </div>
        )}

        {/* Context chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {plant.activeAilmentCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-black border border-rose-100">
              <TriangleAlert size={11} />
              {plant.activeAilmentCount} active {plant.activeAilmentCount === 1 ? "ailment" : "ailments"}
            </span>
          )}
          {plant.overdueTaskCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-black border border-amber-100">
              {plant.overdueTaskCount} overdue
            </span>
          )}
          {plant.dueTodayTaskCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 text-[11px] font-black border border-sky-100">
              <Droplets size={11} />
              {plant.dueTodayTaskCount} due today
            </span>
          )}
          {aiEnabled && plant.freshInsightCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 text-[11px] font-black border border-violet-100">
              <Sparkles size={11} />
              {plant.freshInsightCount} new insight{plant.freshInsightCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Tasks — actionable in-card (RHO-17) */}
        {tasks.length > 0 && (
          <div data-testid="walk-card-tasks" className="mt-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              Tasks for this plant
            </p>
            {tasks.map((t) => (
              <WalkTaskRow
                key={t.id}
                task={t}
                homeId={homeId}
                userId={userId}
                plantName={plant.plantName}
                onCompleted={onTaskCompleted}
              />
            ))}
          </div>
        )}

        {/* Last note */}
        {plant.lastJournalDescription && (
          <div
            data-testid="walk-card-last-note"
            className="mt-4 rounded-2xl bg-white border border-rhozly-outline/15 p-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1">
              Last note{lastNoteRel ? ` · ${lastNoteRel}` : ""}
            </p>
            <p className="text-sm font-bold text-rhozly-on-surface/85 leading-snug">
              {plant.lastJournalDescription}
            </p>
          </div>
        )}

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white border border-rhozly-outline/15 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              Days planted
            </p>
            <p className="text-base font-black text-rhozly-on-surface mt-0.5">
              {plant.daysSincePlanted ?? "—"}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-rhozly-outline/15 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              Last photo'd
            </p>
            <p className="text-base font-black text-rhozly-on-surface mt-0.5">
              {formatRelative(plant.lastPhotoAt) ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div
        data-testid="walk-action-bar"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        className="shrink-0 px-3 pt-3 bg-gradient-to-t from-rhozly-bg via-rhozly-bg/95 to-transparent border-t border-rhozly-outline/10"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="walk-action-snap"
            onClick={() => openSheet("snap")}
            className="flex-1 min-h-[52px] rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/30 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70"
          >
            <Camera size={18} className="mb-0.5" />
            Snap
          </button>
          <button
            type="button"
            data-testid="walk-action-note"
            onClick={() => openSheet("note")}
            className="flex-1 min-h-[52px] rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/30 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70"
          >
            <NotebookPen size={18} className="mb-0.5" />
            Note
          </button>
          <button
            type="button"
            data-testid="walk-action-all-good"
            onClick={() => onOutcome("all_good")}
            className="flex-1 min-h-[52px] rounded-2xl bg-rhozly-primary text-white hover:opacity-95 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest"
          >
            <Check size={18} className="mb-0.5" />
            All good
          </button>
          <button
            type="button"
            data-testid="walk-action-skip"
            onClick={() => onOutcome("skipped")}
            className="shrink-0 min-h-[52px] px-3 rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-outline/30 flex items-center justify-center text-rhozly-on-surface/55"
            aria-label="Skip"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Snap sheet */}
      {sheet === "snap" && (
        <div
          data-testid="walk-snap-sheet"
          className="fixed inset-0 z-50 bg-rhozly-bg/95 backdrop-blur-sm flex flex-col"
        >
          <header
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
            className="shrink-0 px-4 pb-2 flex items-center justify-between"
          >
            <p className="font-display font-black text-rhozly-on-surface">
              Snap — {plant.plantName}
            </p>
            <button
              type="button"
              onClick={closeSheets}
              aria-label="Close"
              className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </header>
          <div
            ref={snapSheetBodyRef}
            data-testid="walk-snap-sheet-body"
            tabIndex={-1}
            className="flex-1 overflow-y-auto px-4 outline-none"
          >
            {isGroup && (
              <InstancePicker
                instances={instances}
                selected={captureTargets}
                onToggle={toggleTarget}
              />
            )}
            <PhotoUploader
              bucket="plant-images"
              pathPrefix={`walks/${homeId}/${plant.inventoryItemId}`}
              value={snapUrl}
              onChange={setSnapUrl}
              testIdPrefix="walk-snap"
              onUploadStart={() => setSnapUploading(true)}
              onUploadEnd={() => setSnapUploading(false)}
              label="Take or pick a photo"
              aspectClass="aspect-video"
            />
          </div>
          <div
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
            className="shrink-0 px-3 pt-3 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={closeSheets}
              className="flex-1 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/15 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/65"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="walk-snap-save"
              onClick={handleSnapSave}
              disabled={!snapUrl || snapUploading}
              className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {snapUploading ? <Loader2 className="animate-spin" size={14} /> : <Camera size={14} />}
              Save photo
            </button>
          </div>
        </div>
      )}

      {/* Note sheet */}
      {sheet === "note" && (
        <div
          data-testid="walk-note-sheet"
          className="fixed inset-0 z-50 bg-rhozly-bg/95 backdrop-blur-sm flex flex-col"
        >
          <header
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
            className="shrink-0 px-4 pb-2 flex items-center justify-between"
          >
            <p className="font-display font-black text-rhozly-on-surface">
              Note — {plant.plantName}
            </p>
            <button
              type="button"
              onClick={closeSheets}
              aria-label="Close"
              className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </header>
          <div
            ref={noteSheetBodyRef}
            data-testid="walk-note-sheet-body"
            className="flex-1 overflow-y-auto px-4"
          >
            {isGroup && (
              <InstancePicker
                instances={instances}
                selected={captureTargets}
                onToggle={toggleTarget}
              />
            )}
            <textarea
              data-testid="walk-note-input"
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What did you notice today?"
              rows={8}
              className="w-full p-3 rounded-2xl bg-white border border-rhozly-outline/15 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 resize-none"
            />
          </div>
          <div
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
            className="shrink-0 px-3 pt-3 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={closeSheets}
              className="flex-1 min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/15 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/65"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="walk-note-save"
              onClick={handleNoteSave}
              disabled={!noteText.trim() || noteSaving}
              className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {noteSaving ? <Loader2 className="animate-spin" size={14} /> : <NotebookPen size={14} />}
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
