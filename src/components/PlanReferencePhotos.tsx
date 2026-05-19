import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Images, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { toast } from "react-hot-toast";
import PhotoUploader from "./PhotoUploader";

interface PlanReferencePhoto {
  id: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
}

interface PlanReferencePhotosProps {
  planId: string;
  homeId: string;
  /** Start expanded? Defaults to false — saves vertical space. */
  defaultOpen?: boolean;
}

/**
 * Reference / inspiration / progress photos attached to a plan.
 * Separate from `plans.cover_image_url` (the single hero on the plan card).
 *
 * Lets users:
 *  - Upload a new photo (with optional caption)
 *  - View existing photos as a small grid
 *  - Click a thumbnail to open a lightbox
 *  - Remove a photo (with confirm)
 */
export default function PlanReferencePhotos({
  planId,
  homeId,
  defaultOpen = false,
}: PlanReferencePhotosProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PlanReferencePhoto[]>([]);
  const [adding, setAdding] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | null>(null);
  const [newCaption, setNewCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("plan_photos")
        .select("id, photo_url, caption, created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPhotos((data ?? []) as PlanReferencePhoto[]);
    } catch (err) {
      Logger.error("Failed to load plan reference photos", err, { planId });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const handleSave = async () => {
    if (!newPhotoUrl) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("plan_photos").insert({
        plan_id: planId,
        home_id: homeId,
        photo_url: newPhotoUrl,
        caption: newCaption.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Reference photo added.");
      setNewPhotoUrl(null);
      setNewCaption("");
      setAdding(false);
      await fetchPhotos();
    } catch (err: any) {
      Logger.error("Failed to save plan reference photo", err, { planId }, "Could not save photo — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("plan_photos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Photo removed.");
      setDeleteId(null);
      await fetchPhotos();
    } catch (err: any) {
      Logger.error("Failed to delete plan reference photo", err, { id }, "Could not remove photo.");
    }
  };

  const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] : null;

  return (
    <section className="bg-white rounded-3xl p-6 shadow-sm border border-rhozly-outline/10" data-testid="plan-reference-photos">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={open}
        data-testid="plan-reference-photos-toggle"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center shrink-0">
            <Images size={18} />
          </div>
          <div>
            <h2 className="text-xl font-black text-rhozly-on-surface">
              Reference photos
              {photos.length > 0 && (
                <span className="ml-2 text-xs font-bold text-rhozly-on-surface/45 align-middle">
                  {photos.length}
                </span>
              )}
            </h2>
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 uppercase tracking-widest">
              Inspiration · progress shots · notes
            </p>
          </div>
        </div>
        <span className="text-rhozly-on-surface/40">
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-rhozly-primary" size={22} />
            </div>
          ) : (
            <>
              {photos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/15 group"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        aria-label={photo.caption || "Open photo"}
                        className="w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary"
                        data-testid={`plan-reference-photo-${idx}`}
                      >
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || "Plan reference"}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 py-1.5">
                            <p className="text-[11px] font-bold text-white leading-tight line-clamp-2">
                              {photo.caption}
                            </p>
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(photo.id)}
                        aria-label="Remove photo"
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-red-500/90 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-600 transition-opacity shadow-sm"
                        data-testid={`plan-reference-photo-${idx}-delete`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : !adding ? (
                <p className="text-sm font-medium text-rhozly-on-surface/55 leading-snug px-1 py-2">
                  No reference photos yet. Add inspiration shots, progress photos, or anything you want to remember about this plan.
                </p>
              ) : null}

              {adding ? (
                <div className="bg-rhozly-surface-low/40 rounded-2xl p-4 space-y-3 border border-rhozly-outline/10">
                  <PhotoUploader
                    bucket="plant-images"
                    pathPrefix="plan-references"
                    value={newPhotoUrl}
                    onChange={setNewPhotoUrl}
                    label="Drop a photo or take one"
                    aspectClass="h-44"
                    testIdPrefix="plan-reference-uploader"
                  />
                  <input
                    type="text"
                    value={newCaption}
                    onChange={(e) => setNewCaption(e.target.value)}
                    placeholder="Caption (optional)"
                    className="w-full text-sm rounded-xl border border-rhozly-outline/20 bg-white px-3 py-2 text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
                    data-testid="plan-reference-uploader-caption"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setAdding(false); setNewPhotoUrl(null); setNewCaption(""); }}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl text-xs font-black text-rhozly-on-surface/60 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!newPhotoUrl || saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-black hover:opacity-90 transition-opacity disabled:opacity-50"
                      data-testid="plan-reference-uploader-save"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      {saving ? "Saving…" : "Save photo"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-rhozly-primary/40 text-rhozly-primary text-sm font-black hover:bg-rhozly-primary/5 transition-colors w-full justify-center"
                  data-testid="plan-reference-photos-add"
                >
                  <Plus size={14} /> Add reference photo
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
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
          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.photo_url}
              alt={lightboxPhoto.caption || "Plan reference"}
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
            />
            <div className="text-center text-white/90 max-w-lg">
              <p className="text-xs font-black uppercase tracking-widest text-white/60">
                {format(new Date(lightboxPhoto.created_at), "d MMMM yyyy")}
              </p>
              {lightboxPhoto.caption && (
                <p className="text-sm font-bold mt-1">{lightboxPhoto.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl">
            <h3 className="text-base font-black text-rhozly-on-surface mb-1">Remove photo?</h3>
            <p className="text-sm font-medium text-rhozly-on-surface/60 leading-snug mb-5">
              The photo will be removed from this plan. The original file stays in storage.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-xl text-xs font-black text-rhozly-on-surface/60 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600 transition-colors"
                data-testid="plan-reference-photo-confirm-delete"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
