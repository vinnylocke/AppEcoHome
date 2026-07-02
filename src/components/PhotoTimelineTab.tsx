import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { BookOpen, CheckCircle2, ImageOff, Loader2, Star, Stethoscope, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

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
  const [photos, setPhotos] = useState<TimelinePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [settingCover, setSettingCover] = useState<string | null>(null);

  const fetchCover = async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("cover_image_url")
      .eq("id", inventoryItemId)
      .maybeSingle();
    setCoverUrl(data?.cover_image_url ?? null);
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
        const [journalsRes, tasksRes, ailmentsRes] = await Promise.all([
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
        ]);

        if (journalsRes.error) throw journalsRes.error;
        if (tasksRes.error) throw tasksRes.error;
        if (ailmentsRes.error) throw ailmentsRes.error;
        if (cancelled) return;

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
          <div
            data-testid="photo-timeline-grid"
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
          >
            {photos.map((photo, idx) => {
              const meta = SOURCE_META[photo.source];
              const isCover = coverUrl === photo.url;
              const isSettingThisCover = settingCover === photo.url;
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
            className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={activePhoto.url}
              alt={activePhoto.subject}
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
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
          </div>
        </div>
      )}
    </div>
  );
}
