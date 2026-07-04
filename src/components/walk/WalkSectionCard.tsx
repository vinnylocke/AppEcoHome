import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BatteryLow,
  Camera,
  Check,
  ChevronRight,
  ClipboardPen,
  Droplets,
  Home,
  Landmark,
  Loader2,
  MapPin,
  NotebookPen,
  Thermometer,
  TriangleAlert,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { usePersona } from "../../hooks/usePersona";
import type {
  WalkDevice,
  WalkSection,
  WalkStep,
  WalkTask,
} from "../../lib/gardenWalk";
import WalkTaskRow from "./WalkTaskRow";
import WalkValveRow from "./WalkValveRow";
import WalkReadingSheet from "./WalkReadingSheet";
import WalkWatchlistPanel from "./WalkWatchlistPanel";
import WalkPlanBanner from "./WalkPlanBanner";
import PhotoUploader from "../PhotoUploader";

// RHO-17 — the shared section card for home / location / area steps in
// the hierarchical Garden Walk. Shows the section's tasks (complete /
// postpone / skip via WalkTaskRow), note + photo capture (both write
// plant_journals rows with inventory_item_id = NULL — the Quick Capture
// unassigned-journal precedent; approved answer 4 adds photos), and the
// Continue / Skip-section controls.
//
// Phase 2 adds telemetry + readings: sensor chips (visual language of
// home/AreaRow.tsx) and valve rows (WalkValveRow — manual open/close via
// the existing integrations control path) for the step's devices, the
// areas.latest_soil_* strip, and a Log-reading sheet (WalkReadingSheet →
// areaReadingsService.logManualReading) on area cards.
//
// Phase 3 weaves in the watchlist (WalkWatchlistPanel — home digest +
// per-area context, tap opens the Watchlist) and In-Progress plans
// (WalkPlanBanner — home digest + actionable area banners), and applies
// the §11 persona pass: the "new" persona (null ⇒ new) gets guidance
// prose per panel; "experienced" gets compact chips and raw values.
// Copy + density only — the structure is identical for both.

type SectionStep = Extract<WalkStep, { kind: "home" | "location" | "area" }>;

interface Props {
  homeId: string;
  userId: string;
  step: SectionStep;
  section: WalkSection;
  progressIndex: number; // zero-based
  progressTotal: number;
  onContinue: () => void;
  onSkipSection: () => void;
  onStop: () => void;
  onTaskCompleted: (task: WalkTask) => void;
  onNoteSaved: () => void;
  onPhotoSaved: () => void;
  /** A manual soil reading was saved from this (area) card. */
  onReadingLogged: () => void;
}

type ActiveSheet = "snap" | "note" | "reading" | null;

// Soil banding mirrors _shared/homeOverview.ts soilBand (same rule the
// dashboard's AreaRow chips use).
function soilLabel(moisture: number): { label: string; classes: string } {
  if (moisture < 30) return { label: "Dry", classes: "bg-yellow-50 text-yellow-800" };
  if (moisture > 70) return { label: "Wet", classes: "bg-sky-50 text-sky-700" };
  return { label: "OK", classes: "bg-green-50 text-green-700" };
}

function readingAge(minutes: number | null): string {
  if (minutes == null) return "no reading yet";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / (24 * 60))} d ago`;
}

function relativeDay(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** One soil-sensor row — moisture band chip + temp + battery pip, greyed
 *  when the reading is over a day old (same thresholds as AreaRow). */
function WalkSensorRow({ device }: { device: WalkDevice }) {
  const sensor = device.sensor;
  const stale = (sensor?.readingAgeMin ?? 0) > 24 * 60;
  const band = sensor?.moisture != null ? soilLabel(sensor.moisture) : null;
  return (
    <div
      data-testid={`walk-sensor-row-${device.id}`}
      className="rounded-2xl bg-white border border-rhozly-outline/15 p-3 flex items-center gap-2"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-rhozly-on-surface truncate">
          {device.name}
        </p>
        <p className="text-[10px] font-bold text-rhozly-on-surface/40">
          {stale ? "Last reading over a day old" : readingAge(sensor?.readingAgeMin ?? null)}
        </p>
      </div>
      <div className="shrink-0 flex flex-wrap items-center gap-1 justify-end">
        {sensor?.moisture != null ? (
          <span
            data-testid={`walk-sensor-chip-${device.id}`}
            className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
              stale ? "bg-gray-100 text-gray-400" : band!.classes
            }`}
          >
            <Droplets size={10} />
            {Math.round(sensor.moisture)}% · {band!.label}
          </span>
        ) : (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            No reading yet
          </span>
        )}
        {sensor?.tempC != null && (
          <span
            className={`flex items-center gap-0.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
              stale ? "bg-gray-100 text-gray-400" : "bg-orange-50 text-orange-700"
            }`}
          >
            <Thermometer size={10} />
            {sensor.tempC.toFixed(1)}°
          </span>
        )}
        {sensor?.batteryPercent != null && sensor.batteryPercent < 25 && (
          <BatteryLow size={12} className="text-orange-500" />
        )}
      </div>
    </div>
  );
}

function autoSubject(sectionLabel: string): string {
  const now = new Date();
  const stamp = now.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Garden Walk — ${sectionLabel} · ${stamp}`;
}

export default function WalkSectionCard({
  homeId,
  userId,
  step,
  section,
  progressIndex,
  progressTotal,
  onContinue,
  onSkipSection,
  onStop,
  onTaskCompleted,
  onNoteSaved,
  onPhotoSaved,
  onReadingLogged,
}: Props) {
  const navigate = useNavigate();
  const persona = usePersona();
  const isNewGardener = persona !== "experienced"; // null ⇒ "new"
  const [sheet, setSheet] = useState<ActiveSheet>(null);
  const [snapUploading, setSnapUploading] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const title =
    step.kind === "home" ? "Your garden" : step.kind === "location" ? step.name : step.name;
  const journalLabel =
    step.kind === "home" ? "Home" : step.name;

  const closeSheets = () => {
    setSheet(null);
    setSnapUrl(null);
    setNoteText("");
  };

  // Section notes/photos are unassigned journal rows — they don't
  // advance the walk and don't write a visit row (only Continue / Skip
  // section resolve the section step).
  const saveJournal = async (fields: { description: string | null; image_url: string | null }) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("plant_journals").insert({
        home_id: homeId,
        inventory_item_id: null,
        subject: autoSubject(journalLabel),
        description: fields.description,
        image_url: fields.image_url,
        task_id: null,
      });
      if (error) throw error;
      if (fields.image_url) onPhotoSaved();
      else onNoteSaved();
      closeSheets();
      toast.success(fields.image_url ? "Photo saved." : "Note saved.");
    } catch (err: unknown) {
      Logger.error("WalkSectionCard journal save failed", err, {
        homeId,
        sectionKey: section.key,
      });
      toast.error("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const subtitle =
    step.kind === "home"
      ? "A quick look before you head out"
      : step.kind === "location"
      ? `${step.areaCount} ${step.areaCount === 1 ? "area" : "areas"} · ${step.plantCount} ${
          step.plantCount === 1 ? "plant" : "plants"
        } ahead`
      : `${step.locationName} · ${step.plantCount} ${
          step.plantCount === 1 ? "plant" : "plants"
        } in this bed`;

  const Icon = step.kind === "home" ? Home : step.kind === "location" ? Landmark : MapPin;

  // Phase 2 — telemetry for this step (sensors first, then valves).
  const sensors = step.devices.filter((d) => d.deviceType === "soil_sensor");
  const valves = step.devices.filter((d) => d.deviceType === "water_valve");
  const latest = step.kind === "area" ? step.latest : null;

  // Phase 3 — watchlist + plans weaving (home and area steps only).
  const watchlist =
    step.kind === "home" || step.kind === "area" ? step.watchlist : [];
  const plans = step.kind === "home" || step.kind === "area" ? step.plans : [];

  return (
    <div
      data-testid="walk-section-card"
      data-section-kind={step.kind}
      className="h-full w-full flex flex-col bg-rhozly-bg"
    >
      {/* Header — progress + stop (same testids as the plant card so the
          Stop contract is uniform across step kinds) */}
      <header
        data-testid="walk-section-header"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        // pl-14 clears the focus-mode floating burger (top-left) now that
        // /walk is focus-mode on every viewport (RHO-18).
        className="shrink-0 pl-14 pr-4 pb-2 flex items-center justify-between gap-2"
      >
        <div
          data-testid="walk-card-progress"
          className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/55"
        >
          Step {progressIndex + 1} of {progressTotal}
          <span className="text-rhozly-on-surface/35"> · {section.label}</span>
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
        <div className="rounded-3xl bg-rhozly-primary/5 p-4 mb-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white border border-rhozly-outline/15 flex items-center justify-center text-rhozly-primary shrink-0">
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <h2
              data-testid="walk-section-title"
              className="font-display font-black text-rhozly-on-surface text-xl leading-tight truncate"
            >
              {title}
            </h2>
            <p className="text-xs font-bold text-rhozly-on-surface/55">{subtitle}</p>
          </div>
        </div>

        {section.skippedEarlier && (
          <div
            data-testid="walk-section-skipped-earlier"
            className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-widest border border-amber-200"
          >
            Skipped earlier — welcome back
          </div>
        )}

        {/* Attention preview — home step only */}
        {step.kind === "home" && step.attentionPreview.length > 0 && (
          <div
            data-testid="walk-section-attention"
            className="mb-4 rounded-2xl bg-white border border-rose-100 p-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 mb-2 inline-flex items-center gap-1">
              <TriangleAlert size={11} />
              Needs your eyes today
            </p>
            <ul className="space-y-1">
              {step.attentionPreview.map((a) => (
                <li
                  key={a.inventoryItemId}
                  className="text-sm font-bold text-rhozly-on-surface/85 leading-snug"
                >
                  {a.plantName}
                  {a.areaName && (
                    <span className="text-rhozly-on-surface/45"> — {a.areaName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Watchlist weaving — Phase 3 (home digest / area context) */}
        {(step.kind === "home" || step.kind === "area") && (
          <WalkWatchlistPanel
            variant={step.kind}
            items={watchlist}
            onOpenWatchlist={() => navigate("/watchlist")}
          />
        )}

        {/* Plans — Phase 3 (home digest / actionable area banners) */}
        {plans.length > 0 && (
          <div data-testid="walk-section-plans" className="mb-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              {step.kind === "home" ? "Plans in progress" : "Plan for this bed"}
            </p>
            {plans.map((p) => (
              <WalkPlanBanner
                key={p.id}
                homeId={homeId}
                plan={p}
                variant={step.kind === "area" ? "area" : "home"}
                areaLocationId={step.kind === "area" ? step.locationId : null}
                onOpenPlanner={() => navigate("/planner")}
              />
            ))}
          </div>
        )}

        {/* Devices — Phase 2 telemetry (sensors then valves) */}
        {step.devices.length > 0 && (
          <div data-testid="walk-section-devices" className="mb-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              Sensors &amp; valves
            </p>
            {sensors.map((d) => (
              <WalkSensorRow key={d.id} device={d} />
            ))}
            {valves.map((d) => (
              <WalkValveRow key={d.id} device={d} />
            ))}
            {isNewGardener && sensors.length > 0 && (
              <p
                data-testid="walk-guidance-devices"
                className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
              >
                Moisture below 30% means the soil is thirsty — most veg and
                borders are happiest between 40–60%.
              </p>
            )}
          </div>
        )}

        {/* Area only — latest logged readings strip + manual capture */}
        {step.kind === "area" && (
          <div
            data-testid="walk-area-readings"
            className="mb-4 rounded-2xl bg-white border border-rhozly-outline/15 p-3"
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1">
                  Soil readings
                </p>
                {latest ? (
                  <p
                    data-testid="walk-area-latest"
                    className="text-sm font-bold text-rhozly-on-surface/80 leading-snug"
                  >
                    {latest.moisturePct != null && (
                      <span className="mr-2">
                        <Droplets size={11} className="inline mr-0.5 text-blue-600" />
                        {Math.round(latest.moisturePct)}%
                      </span>
                    )}
                    {latest.tempC != null && (
                      <span className="mr-2">
                        <Thermometer size={11} className="inline mr-0.5 text-orange-600" />
                        {Number(latest.tempC).toFixed(1)}°C
                      </span>
                    )}
                    <span className="text-rhozly-on-surface/45 font-medium">
                      last logged{" "}
                      {relativeDay(latest.moistureAt ?? latest.tempAt ?? latest.ecAt) ?? "—"}
                    </span>
                  </p>
                ) : (
                  <p
                    data-testid="walk-area-latest-empty"
                    className="text-sm font-bold text-rhozly-on-surface/45 leading-snug"
                  >
                    No readings logged yet — a quick probe now gives this bed a baseline.
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid="walk-log-reading"
                onClick={() => setSheet("reading")}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15"
              >
                <ClipboardPen size={13} />
                Log reading
              </button>
            </div>
            {isNewGardener && (
              <p
                data-testid="walk-guidance-readings"
                className="mt-2 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
              >
                A quick probe while you're stood here builds this bed's
                baseline — the trend over weeks matters more than any single
                number.
              </p>
            )}
          </div>
        )}

        {/* Tasks */}
        {step.tasks.length > 0 ? (
          <div data-testid="walk-section-tasks" className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              {step.kind === "home" ? "Unassigned & personal tasks" : "Tasks here"}
            </p>
            {step.tasks.map((t) => (
              <WalkTaskRow
                key={t.id}
                task={t}
                homeId={homeId}
                userId={userId}
                onCompleted={onTaskCompleted}
              />
            ))}
          </div>
        ) : (
          <p
            data-testid="walk-section-no-tasks"
            className="text-sm font-bold text-rhozly-on-surface/45"
          >
            No open tasks here today.
          </p>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div
        data-testid="walk-section-action-bar"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        className="shrink-0 px-3 pt-3 bg-gradient-to-t from-rhozly-bg via-rhozly-bg/95 to-transparent border-t border-rhozly-outline/10"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="walk-section-snap"
            onClick={() => setSheet("snap")}
            className="flex-1 min-h-[52px] rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/30 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70"
          >
            <Camera size={18} className="mb-0.5" />
            Snap
          </button>
          <button
            type="button"
            data-testid="walk-section-note"
            onClick={() => setSheet("note")}
            className="flex-1 min-h-[52px] rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/30 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70"
          >
            <NotebookPen size={18} className="mb-0.5" />
            Note
          </button>
          <button
            type="button"
            data-testid="walk-section-continue"
            onClick={onContinue}
            className="flex-1 min-h-[52px] rounded-2xl bg-rhozly-primary text-white hover:opacity-95 flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest"
          >
            <Check size={18} className="mb-0.5" />
            Continue
          </button>
          <button
            type="button"
            data-testid="walk-section-skip"
            onClick={onSkipSection}
            aria-label="Skip section"
            className="shrink-0 min-h-[52px] px-3 rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-outline/30 flex flex-col items-center justify-center text-rhozly-on-surface/55"
          >
            <ChevronRight size={20} />
            <span className="text-[8px] font-black uppercase tracking-widest">Section</span>
          </button>
        </div>
      </div>

      {/* Snap sheet */}
      {sheet === "snap" && (
        <div
          data-testid="walk-section-snap-sheet"
          className="fixed inset-0 z-50 bg-rhozly-bg/95 backdrop-blur-sm flex flex-col"
        >
          <header
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
            className="shrink-0 px-4 pb-2 flex items-center justify-between"
          >
            <p className="font-display font-black text-rhozly-on-surface">
              Snap — {journalLabel}
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
          <div className="flex-1 overflow-y-auto px-4">
            <PhotoUploader
              bucket="plant-images"
              pathPrefix={`walks/${homeId}/sections`}
              value={snapUrl}
              onChange={setSnapUrl}
              testIdPrefix="walk-section-snap"
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
              data-testid="walk-section-snap-save"
              onClick={() => void saveJournal({ description: null, image_url: snapUrl })}
              disabled={!snapUrl || snapUploading || saving}
              className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving || snapUploading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Camera size={14} />
              )}
              Save photo
            </button>
          </div>
        </div>
      )}

      {/* Log-reading sheet (area cards only) */}
      {sheet === "reading" && step.kind === "area" && (
        <WalkReadingSheet
          homeId={homeId}
          areaId={step.id}
          areaName={step.name}
          onClose={closeSheets}
          onLogged={onReadingLogged}
        />
      )}

      {/* Note sheet */}
      {sheet === "note" && (
        <div
          data-testid="walk-section-note-sheet"
          className="fixed inset-0 z-50 bg-rhozly-bg/95 backdrop-blur-sm flex flex-col"
        >
          <header
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
            className="shrink-0 px-4 pb-2 flex items-center justify-between"
          >
            <p className="font-display font-black text-rhozly-on-surface">
              Note — {journalLabel}
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
          <div className="flex-1 overflow-y-auto px-4">
            <textarea
              data-testid="walk-section-note-input"
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={`Anything worth remembering about ${journalLabel.toLowerCase() === "home" ? "the garden" : journalLabel}?`}
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
              data-testid="walk-section-note-save"
              onClick={() => void saveJournal({ description: noteText.trim(), image_url: null })}
              disabled={!noteText.trim() || saving}
              className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <NotebookPen size={14} />}
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
