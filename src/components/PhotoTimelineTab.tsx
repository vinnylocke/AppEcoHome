import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { BookOpen, Check, CheckCircle2, ImageOff, Loader2, Sparkles, Star, Stethoscope, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { insertOrQueue } from "../lib/queuedWrite";
import { getLocalDateString } from "../lib/dateUtils";
import { useEntitlements } from "../hooks/useEntitlements";

interface PhotoTimelineTabProps {
  inventoryItemId: string;
}

type PhotoSource = "journal" | "task" | "ailment";

interface TimelinePhoto {
  id: string;
  url: string;
  subject: string;
  description: string | null;
  date: string;
  source: PhotoSource;
}

// Garden Brain Phase 3 — per-photo AI observations (Sage/Evergreen; rows exist
// only when the nightly scan analysed the photo).
interface PhotoAction {
  kind: "create_task" | "check_for_ailment" | "watch_closely";
  task_type?: string;
  title?: string;
  due_in_days?: number;
  suspected?: string;
  reason: string;
  status: "proposed" | "applied" | "dismissed";
  applied_task_id?: string;
}

interface PhotoObservation {
  id: string;
  journal_id: string;
  home_id: string;
  growth_stage: string | null;
  health: "healthy" | "watch" | "concern";
  findings: string;
  actions: PhotoAction[];
}

const HEALTH_META: Record<PhotoObservation["health"], { label: string; chipClass: string }> = {
  healthy: { label: "Healthy", chipClass: "bg-emerald-100 text-emerald-700" },
  watch: { label: "Watch", chipClass: "bg-amber-100 text-amber-700" },
  concern: { label: "Concern", chipClass: "bg-rose-100 text-rose-700" },
};

const SOURCE_META: Record<PhotoSource, { label: string; icon: React.ReactNode; chipClass: string }> = {
  journal: {
    label: "Journal",
    icon: <BookOpen size={10} />,
    chipClass: "bg-emerald-100 text-emerald-700",
  },
  task: {
    label: "Task done",
    icon: <CheckCircle2 size={10} />,
    chipClass: "bg-sky-100 text-sky-700",
  },
  ailment: {
    label: "Ailment",
    icon: <Stethoscope size={10} />,
    chipClass: "bg-rose-100 text-rose-700",
  },
};

export default function PhotoTimelineTab({ inventoryItemId }: PhotoTimelineTabProps) {
  const navigate = useNavigate();
  const { tier } = useEntitlements();
  const [photos, setPhotos] = useState<TimelinePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [settingCover, setSettingCover] = useState<string | null>(null);
  // Keyed by the timeline photo id (`journal-{journal_id}`) so lookup is O(1).
  const [observations, setObservations] = useState<Record<string, PhotoObservation>>({});
  const [plantCtx, setPlantCtx] = useState<{ area_id: string | null; location_id: string | null } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const scanEligible = tier === "sage" || tier === "evergreen";

  const fetchCover = async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("cover_image_url, area_id, location_id")
      .eq("id", inventoryItemId)
      .maybeSingle();
    setCoverUrl(data?.cover_image_url ?? null);
    setPlantCtx({ area_id: data?.area_id ?? null, location_id: data?.location_id ?? null });
  };

  const setAsCover = async (url: string) => {
    setSettingCover(url);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({ cover_image_url: url })
        .eq("id", inventoryItemId);
      if (error) throw error;
      setCoverUrl(url);
      toast.success("Set as plant cover.");
    } catch (err: any) {
      Logger.error("Failed to set plant cover", err, { inventoryItemId }, "Could not set as cover.");
    } finally {
      setSettingCover(null);
    }
  };

  useEffect(() => {
    fetchCover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItemId]);

  /** Persist one action's new status into the observation's actions jsonb. */
  const writeActionStatus = async (
    obs: PhotoObservation,
    actionIdx: number,
    status: "applied" | "dismissed",
    appliedTaskId?: string,
  ) => {
    const nextActions = obs.actions.map((a, i) =>
      i === actionIdx ? { ...a, status, ...(appliedTaskId ? { applied_task_id: appliedTaskId } : {}) } : a,
    );
    const { error } = await supabase.from("photo_observations").update({ actions: nextActions }).eq("id", obs.id);
    if (error) throw error;
    setObservations((prev) => ({ ...prev, [`journal-${obs.journal_id}`]: { ...obs, actions: nextActions } }));
    // Feedback signal for the scan prompt loop (best-effort).
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("ai_feedback").insert({
        user_id: user?.id ?? null,
        home_id: obs.home_id,
        function_name: "scan-journal-photos",
        action: obs.actions[actionIdx]?.kind ?? "photo_action",
        rating: status === "applied" ? 1 : -1,
        target_kind: "photo_observation",
        target_id: obs.id,
      });
    } catch { /* feedback is best-effort */ }
  };

  const applyPhotoAction = async (obs: PhotoObservation, actionIdx: number) => {
    const action = obs.actions[actionIdx];
    if (!action) return;
    const busyKey = `${obs.id}-${actionIdx}`;
    setActionBusy(busyKey);
    try {
      if (action.kind === "create_task") {
        const taskId = crypto.randomUUID();
        const due = new Date();
        due.setDate(due.getDate() + Math.max(0, Math.min(14, action.due_in_days ?? 0)));
        const res = await insertOrQueue("tasks", {
          id: taskId,
          home_id: obs.home_id,
          type: action.task_type,
          title: action.title,
          description: `From Rhozly's photo check: ${action.reason}`,
          due_date: getLocalDateString(due),
          inventory_item_ids: [inventoryItemId],
          area_id: plantCtx?.area_id ?? null,
          location_id: plantCtx?.location_id ?? null,
          status: "Pending",
          scope: "home",
        }, "Photo suggestion task");
        if (res.error) throw res.error;
        await writeActionStatus(obs, actionIdx, "applied", taskId);
        toast.success(res.queued ? "Task queued — it'll sync when you're back online." : "Task added to your schedule.");
      } else if (action.kind === "check_for_ailment") {
        await writeActionStatus(obs, actionIdx, "applied");
        setLightboxIndex(null);
        navigate("/doctor");
      } else {
        // watch_closely — advisory acknowledge only.
        await writeActionStatus(obs, actionIdx, "applied");
        toast.success("Noted — we'll keep an eye out in the next photos.");
      }
    } catch (err) {
      Logger.error("Photo action apply failed", err, { observationId: obs.id }, "Couldn't apply that suggestion.");
    } finally {
      setActionBusy(null);
    }
  };

  const dismissPhotoAction = async (obs: PhotoObservation, actionIdx: number) => {
    const busyKey = `${obs.id}-${actionIdx}`;
    setActionBusy(busyKey);
    try {
      await writeActionStatus(obs, actionIdx, "dismissed");
      toast("Dismissed.");
    } catch (err) {
      Logger.error("Photo action dismiss failed", err, { observationId: obs.id }, "Couldn't dismiss that.");
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Three sources contribute to the per-plant photo timeline:
        //   1. Journal entries with an attached image
        //   2. Completed tasks with a completion photo (tasks.inventory_item_ids
        //      is an array, so we use the @> containment operator)
        //   3. Ailment links with an evidence photo
        // Fired in parallel; results merged + sorted newest-first.
        const [journalsRes, tasksRes, ailmentsRes, observationsRes] = await Promise.all([
          supabase
            .from("plant_journals")
            .select("id, subject, description, image_url, created_at")
            .eq("inventory_item_id", inventoryItemId)
            .not("image_url", "is", null),
          supabase
            .from("tasks")
            .select("id, title, description, completion_photo_url, completed_at, due_date, type")
            .contains("inventory_item_ids", [inventoryItemId])
            .eq("status", "Completed")
            .not("completion_photo_url", "is", null),
          supabase
            .from("plant_instance_ailments")
            .select("id, photo_url, notes, linked_at, ailment:ailments(name, type)")
            .eq("plant_instance_id", inventoryItemId)
            .not("photo_url", "is", null),
          // Garden Brain nightly photo scan (rows only exist on Sage/Evergreen).
          supabase
            .from("photo_observations")
            .select("id, journal_id, home_id, growth_stage, health, findings, actions")
            .eq("inventory_item_id", inventoryItemId),
        ]);

        if (journalsRes.error) throw journalsRes.error;
        if (tasksRes.error) throw tasksRes.error;
        if (ailmentsRes.error) throw ailmentsRes.error;
        if (cancelled) return;

        // Observation fetch is best-effort — a failure must never blank the timeline.
        const obsByPhotoId: Record<string, PhotoObservation> = {};
        for (const row of (observationsRes.data ?? []) as PhotoObservation[]) {
          obsByPhotoId[`journal-${row.journal_id}`] = { ...row, actions: Array.isArray(row.actions) ? row.actions : [] };
        }
        setObservations(obsByPhotoId);

        const journalPhotos: TimelinePhoto[] = (journalsRes.data ?? []).map((row: any) => ({
          id: `journal-${row.id}`,
          url: row.image_url,
          subject: row.subject || "Journal entry",
          description: row.description || null,
          date: row.created_at,
          source: "journal",
        }));

        const taskPhotos: TimelinePhoto[] = (tasksRes.data ?? []).map((row: any) => ({
          id: `task-${row.id}`,
          url: row.completion_photo_url,
          subject: `${row.type ?? "Task"} — ${row.title}`,
          description: row.description || null,
          date: row.completed_at ?? row.due_date,
          source: "task",
        }));

        const ailmentPhotos: TimelinePhoto[] = (ailmentsRes.data ?? []).map((row: any) => {
          const ailment = Array.isArray(row.ailment) ? row.ailment[0] : row.ailment;
          return {
            id: `ailment-${row.id}`,
            url: row.photo_url,
            subject: ailment?.name ? `Ailment: ${ailment.name}` : "Ailment evidence",
            description: row.notes || null,
            date: row.linked_at,
            source: "ailment" as const,
          };
        });

        const merged = [...journalPhotos, ...taskPhotos, ...ailmentPhotos].sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          return db - da;
        });
        setPhotos(merged);
      } catch (err) {
        Logger.error("Failed to load photo timeline", err, { inventoryItemId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inventoryItemId]);

  const activePhoto = lightboxIndex != null ? photos[lightboxIndex] : null;
  const activeObs = activePhoto ? observations[activePhoto.id] ?? null : null;

  return (
    <div className="animate-in slide-in-from-left-4 space-y-4" data-testid="photo-timeline-tab">
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-rhozly-primary" size={28} />
        </div>
      )}

      {!loading && photos.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center px-6 bg-rhozly-surface-low rounded-3xl border border-rhozly-outline/15">
          <div className="bg-white p-3 rounded-2xl border border-rhozly-outline/15">
            <ImageOff size={22} className="text-rhozly-on-surface/40" />
          </div>
          <div>
            <p className="text-sm font-black text-rhozly-on-surface">No photos yet</p>
            <p className="text-xs font-medium text-rhozly-on-surface/55 leading-snug mt-1 max-w-xs">
              Add a photo to a Journal entry and it will appear here in date order — a quick visual timeline of how your plant has changed.
            </p>
          </div>
        </div>
      )}

      {!loading && photos.length > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
            {photos.length} photo{photos.length === 1 ? "" : "s"} · newest first
          </p>
          {!scanEligible && photos.some((p) => p.source === "journal") && (
            <p
              data-testid="photo-observation-upsell"
              className="text-[11px] font-bold text-rhozly-on-surface/55 bg-rhozly-surface-low rounded-xl px-3 py-2 flex items-start gap-1.5"
            >
              <Sparkles size={12} className="text-rhozly-primary shrink-0 mt-0.5" />
              <span>On Sage and Evergreen, Rhozly checks each new journal photo overnight — growth stage, health and suggested next steps appear right here.</span>
            </p>
          )}
          <div
            data-testid="photo-timeline-grid"
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
          >
            {photos.map((photo, idx) => {
              const meta = SOURCE_META[photo.source];
              const isCover = coverUrl === photo.url;
              const isSettingThisCover = settingCover === photo.url;
              const obs = observations[photo.id];
              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/15"
                  data-testid={`photo-timeline-item-${idx}`}
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    aria-label={`Open photo: ${photo.subject}`}
                    className="w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary"
                  >
                    <img
                      src={photo.url}
                      alt={photo.subject}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2.5 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/85">
                        {format(new Date(photo.date), "d MMM yyyy")}
                      </p>
                      <p className="text-[11px] font-bold text-white leading-tight truncate">
                        {photo.subject}
                      </p>
                    </div>
                  </button>

                  <span
                    className={`absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm pointer-events-none ${meta.chipClass}`}
                    data-testid={`photo-timeline-source-${photo.source}-${idx}`}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>

                  {obs && (
                    <span
                      className={`absolute top-7 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm pointer-events-none ${HEALTH_META[obs.health].chipClass}`}
                      data-testid="photo-observation-chip"
                    >
                      <Sparkles size={9} />
                      {HEALTH_META[obs.health].label}
                    </span>
                  )}

                  {/* Cover indicator / action */}
                  {isCover ? (
                    <span
                      className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm bg-amber-400 text-amber-950 pointer-events-none"
                      data-testid={`photo-timeline-item-${idx}-is-cover`}
                    >
                      <Star size={9} className="fill-amber-950" /> Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAsCover(photo.url)}
                      disabled={isSettingThisCover}
                      aria-label="Set as plant cover"
                      title="Set as plant cover"
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/85 backdrop-blur-sm text-rhozly-on-surface/70 hover:text-amber-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-sm disabled:opacity-100"
                      data-testid={`photo-timeline-item-${idx}-set-cover`}
                    >
                      {isSettingThisCover ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Star size={11} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Lightbox */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close photo"
            className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 transition-colors"
          >
            <X size={18} />
          </button>
          <div
            className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={activePhoto.url}
              alt={activePhoto.subject}
              className={`max-w-full ${activeObs ? "max-h-[55vh]" : "max-h-[80vh]"} rounded-2xl shadow-2xl object-contain`}
            />
            <div className="text-center text-white/90 max-w-lg">
              <p className="text-xs font-black uppercase tracking-widest text-white/60">
                {format(new Date(activePhoto.date), "d MMMM yyyy")}
              </p>
              <p className="text-sm font-black mt-1">{activePhoto.subject}</p>
              {activePhoto.description && (
                <p className="text-xs font-medium text-white/75 mt-1 leading-snug">
                  {activePhoto.description}
                </p>
              )}
            </div>

            {/* Garden Brain observation — stage, health, findings, actions */}
            {activeObs && (
              <div
                data-testid="photo-observation-panel"
                className="w-full max-w-lg bg-white/10 backdrop-blur-md rounded-2xl p-4 text-left space-y-2.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/70">
                    <Sparkles size={11} className="text-white/80" /> Rhozly's photo check
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${HEALTH_META[activeObs.health].chipClass}`}>
                    {HEALTH_META[activeObs.health].label}
                  </span>
                  {activeObs.growth_stage && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/15 text-white/85">
                      {activeObs.growth_stage}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-white/85 leading-snug">{activeObs.findings}</p>

                {activeObs.actions.map((action, ai) => {
                  const busy = actionBusy === `${activeObs.id}-${ai}`;
                  const title =
                    action.kind === "create_task" ? action.title ?? "Add a task"
                    : action.kind === "check_for_ailment" ? `Possible ${action.suspected ?? "ailment"} — run a diagnosis`
                    : "Keep a close eye on this plant";
                  const applyLabel =
                    action.kind === "create_task" ? "Add task"
                    : action.kind === "check_for_ailment" ? "Diagnose now"
                    : "Got it";
                  return (
                    <div key={ai} className="rounded-xl bg-white/10 px-3 py-2 space-y-1.5" data-testid={`photo-action-${action.kind}`}>
                      <p className="text-[11px] font-black text-white leading-snug">{title}</p>
                      <p className="text-[11px] font-medium text-white/70 leading-snug">{action.reason}</p>
                      {action.status === "proposed" ? (
                        <div className="flex gap-2 pt-0.5">
                          <button
                            data-testid="photo-action-apply"
                            onClick={() => void applyPhotoAction(activeObs, ai)}
                            disabled={busy}
                            className="h-8 px-3 rounded-lg bg-rhozly-primary text-white text-[10px] font-black flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
                          >
                            {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                            {applyLabel}
                          </button>
                          {action.kind !== "watch_closely" && (
                            <button
                              data-testid="photo-action-dismiss"
                              onClick={() => void dismissPhotoAction(activeObs, ai)}
                              disabled={busy}
                              className="h-8 px-3 rounded-lg bg-white/15 text-white/80 text-[10px] font-black flex items-center gap-1 hover:bg-white/25 disabled:opacity-50"
                            >
                              <X size={10} /> Dismiss
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className={`text-[10px] font-black flex items-center gap-1 ${action.status === "applied" ? "text-emerald-300" : "text-white/50"}`}>
                          {action.status === "applied" ? (<><Check size={10} /> {action.kind === "create_task" ? "Added to your schedule" : "Done"}</>) : "Dismissed"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
