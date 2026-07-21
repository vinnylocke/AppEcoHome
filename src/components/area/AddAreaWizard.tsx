import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { getLocalDateString } from "../../lib/dateUtils";
import { AutomationEngine } from "../../lib/automationEngine";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { usePermissions } from "../../context/HomePermissionsContext";
import AreaAdvancedFields from "../AreaAdvancedFields";
import PlantSearchModal from "../PlantSearchModal";
import { TaskActionButtons } from "../TaskActionButtons";
import AiFeedback from "../ai/AiFeedback";
import {
  EMPTY_BED,
  addPendingPlant,
  buildAreaCommit,
  removePendingPlant,
  setPendingQuantity,
  validateBed,
  type PendingPlant,
  type WizardBedState,
} from "../../lib/addAreaWizard";
import {
  fetchAreaSetupReview,
  type AreaSetupReview,
} from "../../services/areaSetupReviewService";

// Add-Area wizard (2026-07-18) — replaces the old "New Area" stub insert.
// Step 1 collects the name + the Advanced-settings environment fields
// (AreaAdvancedFields reused; its lux history panel self-hides because
// the area has no id yet — a plain peak-light input stands in). Step 2
// gathers plants: new instances of Shed plants, or search (the existing
// PlantSearchModal persists the plants row + hands it back). Commit
// writes area → lux reading → instances → applyPlantedAutomations.
// Step 3 (AI tiers) runs area-setup-review on the now-real rows.
// Nothing is written before commit except search-added Shed rows
// (deliberate — "search also adds to the Shed" is the feature).

interface ShedPlant {
  id: number;
  common_name: string;
  thumbnail_url: string | null;
}

interface Props {
  homeId: string;
  location: { id: string; name: string };
  aiEnabled: boolean;
  isPremium: boolean;
  onClose: () => void;
  /** Fires after the commit succeeded (before/without the AI step). */
  onCreated: (areaId: string) => void;
}

type Step = "bed" | "plants" | "review";

function humanise(code: string): string {
  switch (code) {
    case "name_required":
      return "Give the area a name first.";
    case "ph_out_of_range":
      return "pH must be between 0 and 14.";
    case "lux_out_of_range":
      return "Peak light must be a positive lux value.";
    default:
      return "Couldn't create the area — try again.";
  }
}

const FIT_STYLE: Record<string, string> = {
  great: "text-green-700 bg-green-50 border-green-200",
  ok: "text-amber-700 bg-amber-50 border-amber-200",
  poor: "text-red-700 bg-red-50 border-red-200",
  unknown: "text-slate-600 bg-slate-50 border-slate-200",
};

function scoreTone(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function AddAreaWizard({
  homeId,
  location,
  aiEnabled,
  isPremium,
  onClose,
  onCreated,
}: Props) {
  const { can } = usePermissions();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState<Step>("bed");

  // Step 1 — bed. `advanced` uses the areas column names so
  // AreaAdvancedFields plugs in unchanged; `name` + `lux` live beside it.
  const [name, setName] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, unknown>>({});
  const [lux, setLux] = useState("");

  // Step 2 — plants.
  const [shedPlants, setShedPlants] = useState<ShedPlant[] | null>(null);
  const [pending, setPending] = useState<PendingPlant[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);

  // Commit + review. Refs (not state) guard the write stages: state is
  // async, so a double-tap or a retry could read stale nulls and
  // double-create (review findings 1 + 3). Each stage runs at most once.
  const [committing, setCommitting] = useState(false);
  const [createdAreaId, setCreatedAreaId] = useState<string | null>(null);
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const commitInFlightRef = useRef(false);
  const areaIdRef = useRef<string | null>(null);
  const instancesCommittedRef = useRef(false);
  const [review, setReview] = useState<AreaSetupReview | null>(null);
  const [reviewState, setReviewState] = useState<"idle" | "loading" | "error" | "rate_limited">("idle");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("plants")
      .select("id, common_name, thumbnail_url")
      .eq("home_id", homeId)
      .order("common_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          Logger.error("AddAreaWizard shed fetch failed", error, { homeId });
          setShedPlants([]);
        } else {
          setShedPlants((data ?? []) as ShedPlant[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  const bedState: WizardBedState = useMemo(
    () => ({
      ...EMPTY_BED,
      name,
      growingMedium: (advanced.growing_medium as string) ?? "",
      mediumTexture: (advanced.medium_texture as string) ?? "",
      ph: advanced.medium_ph != null ? String(advanced.medium_ph) : "",
      lux,
      waterMovement: (advanced.water_movement as string) ?? "",
      nutrientSource: (advanced.nutrient_source as string) ?? "",
    }),
    [name, advanced, lux],
  );

  const goToPlants = () => {
    const err = validateBed(bedState);
    if (err) {
      toast.error(humanise(err));
      return;
    }
    setStep("plants");
  };

  /** Skip path — fast exit without the review step. Any plants already
   *  chosen (user went to step 2 and came Back) are still committed —
   *  silently dropping a selection would be data loss (review finding 2). */
  const skipAndCreate = async () => {
    const err = validateBed(bedState);
    if (err) {
      toast.error(humanise(err));
      return;
    }
    await commit({ skipReview: true });
  };

  const runReview = async (areaId: string) => {
    setReviewState("loading");
    const outcome = await fetchAreaSetupReview(homeId, areaId);
    if (outcome.kind === "ok") {
      setReview(outcome.review);
      setReviewState("idle");
    } else if (outcome.kind === "rate_limited") {
      setReviewState("rate_limited");
    } else {
      // ai_required shouldn't happen (step is client-gated) — treat as error.
      setReviewState("error");
    }
  };

  const commit = async (opts?: { skipReview?: boolean }) => {
    // Defense-in-depth: gate the commit itself, not only the callers. Both
    // callers (LocationPage + LocationManager) gate their trigger with
    // can("areas.create"), but a future caller that forgets would otherwise
    // open an ungated create (RLS gates only home membership). Review finding.
    if (!can("areas.create")) {
      toast.error("You don't have permission to add areas here.");
      return;
    }
    // Synchronous re-entry lock — `committing` state is async, so a fast
    // double-tap could otherwise run two full commits (review finding 3).
    if (commitInFlightRef.current) return;
    commitInFlightRef.current = true;
    setCommitting(true);
    try {
      const { areaFields, luxReading, instanceSeeds } = buildAreaCommit(bedState, pending);

      // The retry path re-enters here with the area already created —
      // only the failed stages re-run. Stage guards are refs, not state.
      let areaId = areaIdRef.current;
      if (!areaId) {
        const { data: areaRow, error: areaErr } = await supabase
          .from("areas")
          .insert([{ ...areaFields, location_id: location.id }])
          .select("id")
          .single();
        if (areaErr) throw areaErr;
        areaId = areaRow.id as string;
        areaIdRef.current = areaId;
        setCreatedAreaId(areaId);

        if (luxReading !== null) {
          // Mirror AreaLuxReadings: the peak light is also a manual lux
          // reading so Light Sensor history stays coherent. Non-fatal.
          const { error: luxErr } = await supabase.from("area_lux_readings").insert({
            home_id: homeId,
            area_id: areaId,
            lux_value: luxReading,
            recorded_at: new Date().toISOString(),
            source: "manual",
          });
          if (luxErr) Logger.error("AddAreaWizard lux reading failed", luxErr, { areaId });
        }
      }

      let created: Array<{ id: string; plant_id: number }> = [];
      // The batch insert is atomic (one statement), so this stage either
      // fully landed or didn't — the ref stops a retry from re-inserting
      // a batch that DID land when a later stage failed (review finding 1).
      if (instanceSeeds.length > 0 && !instancesCommittedRef.current) {
        const today = getLocalDateString(new Date());
        const rows = instanceSeeds.map((seed) => ({
          home_id: homeId,
          plant_id: seed.plant_id,
          plant_name: seed.plant_name,
          status: "Planted",
          location_id: location.id,
          location_name: location.name,
          area_id: areaId,
          area_name: areaFields.name,
          planted_at: today,
          is_established: false,
          growth_state: "Vegetative",
          identifier: `${seed.plant_name} #${Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, "0")}`,
        }));
        const { data: inserted, error: instErr } = await supabase
          .from("inventory_items")
          .insert(rows)
          .select("id, plant_id");
        if (instErr) throw instErr;
        created = (inserted ?? []) as Array<{ id: string; plant_id: number }>;
        instancesCommittedRef.current = true;
        setInstanceIds(created.map((r) => r.id));

        // Best-effort, like every other planting surface — an automation
        // hiccup must not fail (and invite a retry of) a committed planting.
        try {
          await AutomationEngine.applyPlantedAutomations(created, areaId, today);
        } catch (autoErr) {
          Logger.error("AddAreaWizard planted automations failed (non-fatal)", autoErr, { areaId });
        }
      }

      toast.success(
        instanceSeeds.length > 0
          ? `${areaFields.name} created with ${instanceSeeds.length} plant${instanceSeeds.length === 1 ? "" : "s"}`
          : `${areaFields.name} created`,
      );
      onCreated(areaId);

      if (aiEnabled && !opts?.skipReview) {
        setStep("review");
        void runReview(areaId);
      } else {
        onClose();
      }
    } catch (err) {
      Logger.error("AddAreaWizard commit failed", err, { homeId });
      toast.error(
        areaIdRef.current
          ? "The area was created but some plants couldn't be added — tap Create again to retry them."
          : "Couldn't create the area — try again.",
      );
    } finally {
      commitInFlightRef.current = false;
      setCommitting(false);
    }
  };

  /** A plant added from the review's recommendations goes straight into the area. */
  const addRecommendedInstance = async (plant: { id: number; common_name: string }) => {
    if (!createdAreaId) return;
    const today = getLocalDateString(new Date());
    const { data: inserted, error } = await supabase
      .from("inventory_items")
      .insert({
        home_id: homeId,
        plant_id: plant.id,
        plant_name: plant.common_name,
        status: "Planted",
        location_id: location.id,
        location_name: location.name,
        area_id: createdAreaId,
        area_name: name.trim(),
        planted_at: today,
        is_established: false,
        growth_state: "Vegetative",
        identifier: `${plant.common_name} #${Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0")}`,
      })
      .select("id, plant_id")
      .single();
    if (error) {
      Logger.error("AddAreaWizard recommended add failed", error, { plantId: plant.id });
      toast.error(`Couldn't add ${plant.common_name}.`);
      return;
    }
    setInstanceIds((ids) => [...ids, inserted.id as string]);
    await AutomationEngine.applyPlantedAutomations([inserted], createdAreaId, today);
    toast.success(`${plant.common_name} added to ${name.trim()}`);
  };

  const inputClass =
    "w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20 focus:border-rhozly-primary outline-none";

  return createPortal(
    <div
      data-testid="add-area-wizard"
      className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={step === "review" ? undefined : onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-area-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl border border-rhozly-outline/10 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rhozly-outline/10 shrink-0">
          <div>
            <h2 id="add-area-title" className="font-display font-black text-lg text-rhozly-on-surface">
              {step === "bed" && "New area — set up the bed"}
              {step === "plants" && "New area — add plants"}
              {step === "review" && "AI setup review"}
            </h2>
            <p className="text-[11px] font-bold text-rhozly-on-surface/45">
              {location.name}
              {step !== "bed" && name.trim() ? ` · ${name.trim()}` : ""}
            </p>
          </div>
          <button
            type="button"
            data-testid="add-area-close"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "bed" && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Area name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Raised Bed A"
                  data-testid="add-area-name"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <AreaAdvancedFields
                data={advanced}
                homeId={homeId}
                onChange={(fields) => setAdvanced((a) => ({ ...a, ...fields }))}
              />

              {/* AreaAdvancedFields' lux history panel needs an existing
                  area id — a plain value input stands in pre-creation. */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <Zap size={14} /> Peak light (lux)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={lux}
                  onChange={(e) => setLux(e.target.value)}
                  placeholder="e.g. 25000 — the Light Sensor tool can measure this"
                  data-testid="add-area-lux"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {step === "plants" && (
            <div className="space-y-5">
              {/* Pending list */}
              {pending.length > 0 && (
                <div data-testid="add-area-pending" className="space-y-2">
                  {pending.map((p) => (
                    <div
                      key={p.plantId}
                      className="flex items-center gap-3 rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-lowest px-3 py-2"
                    >
                      {p.thumbnailUrl ? (
                        <img src={p.thumbnailUrl} alt="" className="w-9 h-9 rounded-xl object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-rhozly-surface-low" />
                      )}
                      <p className="flex-1 text-sm font-bold text-rhozly-on-surface truncate">{p.name}</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Fewer ${p.name}`}
                          onClick={() => setPending((l) => setPendingQuantity(l, p.plantId, p.quantity - 1))}
                          className="w-8 h-8 rounded-xl bg-rhozly-surface-low flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <span data-testid={`add-area-qty-${p.plantId}`} className="w-7 text-center text-sm font-black">
                          {p.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`More ${p.name}`}
                          onClick={() => setPending((l) => setPendingQuantity(l, p.plantId, p.quantity + 1))}
                          className="w-8 h-8 rounded-xl bg-rhozly-surface-low flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          onClick={() => setPending((l) => removePendingPlant(l, p.plantId))}
                          className="w-8 h-8 rounded-xl text-red-500 hover:bg-red-50 flex items-center justify-center"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                data-testid="add-area-search-new"
                onClick={() => {
                  setSearchTerm(undefined);
                  setSearchOpen(true);
                }}
                className="w-full min-h-[48px] rounded-2xl border-2 border-dashed border-rhozly-outline/25 text-rhozly-on-surface/60 text-sm font-black flex items-center justify-center gap-2 hover:border-rhozly-primary/40 hover:text-rhozly-primary transition-colors"
              >
                <Search size={16} />
                Search for a new plant (adds it to your Shed too)
              </button>

              {/* From the Shed */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 ml-1">
                  From your Shed
                </p>
                {shedPlants === null ? (
                  <div className="flex justify-center py-6">
                    <Loader2 size={18} className="animate-spin text-rhozly-on-surface/40" />
                  </div>
                ) : shedPlants.length === 0 ? (
                  <p className="text-sm font-bold text-rhozly-on-surface/50 px-1">
                    Nothing in the Shed yet — search above to add your first plant.
                  </p>
                ) : (
                  <div data-testid="add-area-shed-list" className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {shedPlants.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`add-area-shed-${p.id}`}
                        onClick={() =>
                          setPending((l) =>
                            addPendingPlant(l, { plantId: p.id, name: p.common_name, thumbnailUrl: p.thumbnail_url }),
                          )
                        }
                        className="flex items-center gap-2 rounded-2xl border border-rhozly-outline/15 px-3 py-2 text-left hover:border-rhozly-primary/40 transition-colors"
                      >
                        {p.thumbnail_url ? (
                          <img src={p.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-rhozly-surface-low shrink-0" />
                        )}
                        <span className="text-xs font-bold text-rhozly-on-surface truncate">{p.common_name}</span>
                        <Plus size={12} className="ml-auto shrink-0 text-rhozly-on-surface/40" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-5" data-testid="add-area-review">
              {reviewState === "loading" && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 size={24} className="animate-spin text-rhozly-primary" />
                  <p className="text-sm font-bold text-rhozly-on-surface/60">
                    Reviewing your setup…
                  </p>
                </div>
              )}
              {reviewState === "rate_limited" && (
                <p className="text-sm font-bold text-amber-700 bg-amber-50 rounded-2xl p-4">
                  You've hit the review limit for now — the area and plants are saved; try the
                  review again later from Area details.
                </p>
              )}
              {reviewState === "error" && (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm font-bold text-rhozly-on-surface/60">
                    The review didn't come back — your area and plants are saved.
                  </p>
                  <button
                    type="button"
                    data-testid="add-area-review-retry"
                    onClick={() => createdAreaId && void runReview(createdAreaId)}
                    className="px-4 py-2 rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest"
                  >
                    Try again
                  </button>
                </div>
              )}

              {review && reviewState === "idle" && (
                <>
                  <div className="flex items-center gap-4">
                    <p
                      data-testid="add-area-score"
                      className={`font-display font-black text-5xl ${scoreTone(review.score)}`}
                    >
                      {review.score}
                    </p>
                    <div className="min-w-0">
                      <p className="font-display font-black text-rhozly-on-surface">{review.headline}</p>
                      <p className="text-sm text-rhozly-on-surface/65 leading-snug">{review.summary}</p>
                    </div>
                  </div>

                  {review.plant_fit.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Plant fit
                      </p>
                      {review.plant_fit.map((f, i) => (
                        <div key={i} className={`rounded-2xl border px-3 py-2 ${FIT_STYLE[f.verdict]}`}>
                          <p className="text-sm font-black">
                            {f.name} — {f.verdict === "ok" ? "OK" : f.verdict}
                          </p>
                          {f.note && <p className="text-xs font-bold opacity-80 leading-snug">{f.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`rounded-2xl border px-3 py-2 ${FIT_STYLE[review.compatibility.verdict === "well" ? "great" : review.compatibility.verdict === "minor" ? "ok" : review.compatibility.verdict === "poor" ? "poor" : "unknown"]}`}>
                    <p className="text-sm font-black">
                      Growing together:{" "}
                      {review.compatibility.verdict === "well"
                        ? "these plants suit each other"
                        : review.compatibility.verdict === "minor"
                          ? "some friction — manageable"
                          : review.compatibility.verdict === "poor"
                            ? "a difficult pairing"
                            : "not enough data"}
                    </p>
                    {review.compatibility.note && (
                      <p className="text-xs font-bold opacity-80 leading-snug">{review.compatibility.note}</p>
                    )}
                  </div>

                  {review.recommendations.plants.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Plants that would thrive here
                      </p>
                      {review.recommendations.plants.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-2xl border border-rhozly-outline/15 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-rhozly-on-surface">{p.name}</p>
                            <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug">{p.reason}</p>
                          </div>
                          <button
                            type="button"
                            data-testid={`add-area-rec-plant-${i}`}
                            onClick={() => {
                              setSearchTerm(p.search_query);
                              setSearchOpen(true);
                            }}
                            className="shrink-0 px-3 py-2 rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black uppercase tracking-widest flex items-center gap-1"
                          >
                            <Search size={12} /> Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {review.recommendations.tasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Suggested care for this bed
                      </p>
                      <TaskActionButtons
                        tasks={review.recommendations.tasks.map((t) => ({
                          ...t,
                          end_offset_days: null,
                          depends_on_index: null,
                        }))}
                        homeId={homeId}
                        inventoryItemIds={instanceIds}
                      />
                    </div>
                  )}

                  {review.recommendations.automations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Automation ideas
                      </p>
                      {review.recommendations.automations.map((a, i) => (
                        <div key={i} className="rounded-2xl border border-rhozly-outline/15 px-3 py-2">
                          <p className="text-sm font-black text-rhozly-on-surface">{a.title}</p>
                          <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug">{a.description}</p>
                        </div>
                      ))}
                      <a
                        href="/integrations?tab=automations"
                        className="inline-flex items-center gap-1 text-xs font-black text-rhozly-primary"
                      >
                        Set up automations <ChevronRight size={12} />
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <AiFeedback
                      functionName="area-setup-review"
                      action="setup_review"
                      homeId={homeId}
                      targetKind="area_setup_review"
                      targetId={createdAreaId ?? undefined}
                    />
                    <button
                      type="button"
                      data-testid="add-area-review-regenerate"
                      onClick={() => createdAreaId && void runReview(createdAreaId)}
                      className="text-xs font-black text-rhozly-on-surface/50 flex items-center gap-1 hover:text-rhozly-on-surface"
                    >
                      <Sparkles size={12} /> Regenerate
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-rhozly-outline/10 shrink-0 flex items-center gap-2">
          {step === "bed" && (
            <>
              <button
                type="button"
                data-testid="add-area-skip"
                onClick={() => void skipAndCreate()}
                disabled={committing}
                className="px-4 min-h-[48px] rounded-2xl text-rhozly-on-surface/50 text-xs font-black uppercase tracking-widest hover:text-rhozly-on-surface disabled:opacity-50"
              >
                Skip — just create
              </button>
              <button
                type="button"
                data-testid="add-area-next"
                onClick={goToPlants}
                className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                Choose plants <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === "plants" && (
            <>
              <button
                type="button"
                data-testid="add-area-back"
                onClick={() => setStep("bed")}
                disabled={committing}
                className="px-4 min-h-[48px] rounded-2xl text-rhozly-on-surface/50 text-xs font-black uppercase tracking-widest hover:text-rhozly-on-surface disabled:opacity-50 flex items-center gap-1"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                data-testid="add-area-create"
                onClick={() => void commit()}
                disabled={committing}
                className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {committing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {pending.length > 0
                  ? `Create area with ${pending.reduce((n, p) => n + p.quantity, 0)} plant${pending.reduce((n, p) => n + p.quantity, 0) === 1 ? "" : "s"}`
                  : "Create area"}
              </button>
            </>
          )}
          {step === "review" && (
            <button
              type="button"
              data-testid="add-area-done"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Done <Check size={16} />
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <PlantSearchModal
          homeId={homeId}
          isPremium={isPremium}
          isAiEnabled={aiEnabled}
          initialSearchTerm={searchTerm}
          zIndexClassName="z-[130]"
          onClose={() => setSearchOpen(false)}
          onSuccess={(newPlant: { id: number; common_name: string; thumbnail_url?: string | null }) => {
            setSearchOpen(false);
            if (step === "review") {
              // Recommendation flow — the area exists; plant it directly.
              void addRecommendedInstance(newPlant);
            } else {
              setPending((l) =>
                addPendingPlant(l, {
                  plantId: newPlant.id,
                  name: newPlant.common_name,
                  thumbnailUrl: newPlant.thumbnail_url ?? null,
                }),
              );
              toast.success(`${newPlant.common_name} added to your Shed and this area's list`);
            }
          }}
        />
      )}
    </div>,
    document.body,
  );
}
