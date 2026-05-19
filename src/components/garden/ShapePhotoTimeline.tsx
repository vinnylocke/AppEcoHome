import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Image as ImageIcon, Stethoscope } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

interface Photo {
  id: string;
  photo_path: string;
  signed_url: string | null;
  caption: string | null;
  taken_at: string;
}

interface Props {
  shapeId: string;
  homeId: string;
}

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

export default function ShapePhotoTimeline({ shapeId, homeId }: Props) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function diagnoseFromPhoto(photo: Photo) {
    if (!photo.signed_url) return;
    try {
      sessionStorage.setItem("rhozly:doctor-image", photo.signed_url);
      sessionStorage.setItem("rhozly:doctor-source", `shape-photo:${photo.id}`);
      navigate("/doctor");
    } catch (err) {
      Logger.error("Failed to hand photo off to Plant Doctor", err);
      toast.error("Could not open Plant Doctor");
    }
  }

  useEffect(() => { void fetchPhotos(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shapeId]);

  async function fetchPhotos() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("garden_shape_photos")
        .select("id, photo_path, caption, taken_at")
        .eq("shape_id", shapeId)
        .order("taken_at", { ascending: false });
      if (error) throw error;

      const withUrls = await Promise.all(
        (data ?? []).map(async (p) => {
          const { data: signed } = await supabase
            .storage.from("garden-photos")
            .createSignedUrl(p.photo_path, SIGNED_TTL_SECONDS);
          return { ...p, signed_url: signed?.signedUrl ?? null };
        }),
      );
      setPhotos(withUrls);
    } catch (err) {
      Logger.error("Failed to load shape photos", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const stamp = Date.now();
      const path = `${homeId}/${shapeId}/${stamp}.${ext}`;

      const { error: upErr } = await supabase
        .storage.from("garden-photos")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: userResp } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase.from("garden_shape_photos").insert({
        shape_id: shapeId,
        home_id: homeId,
        photo_path: path,
        created_by: userResp.user?.id ?? null,
      });
      if (dbErr) throw dbErr;

      toast.success("Photo added");
      await fetchPhotos();
    } catch (err) {
      Logger.error("Failed to upload shape photo", err);
      toast.error("Could not upload photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(photo: Photo) {
    if (deletingId) return;
    setDeletingId(photo.id);
    try {
      await supabase.storage.from("garden-photos").remove([photo.photo_path]);
      const { error } = await supabase.from("garden_shape_photos").delete().eq("id", photo.id);
      if (error) throw error;
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err) {
      Logger.error("Failed to delete shape photo", err);
      toast.error("Could not delete photo");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="shape-photo-timeline">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Photos</p>
        <button
          data-testid="shape-photo-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-rhozly-primary/90 transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {uploading ? "Uploading" : "Add"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-rhozly-on-surface/30" />
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-surface flex items-center justify-center">
            <ImageIcon size={20} className="text-rhozly-on-surface/30" />
          </div>
          <p className="text-xs font-bold text-rhozly-on-surface/50">No photos yet</p>
          <p className="text-[10px] font-bold text-rhozly-on-surface/40">Tap Add to capture this bed</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-rhozly-surface group">
              {photo.signed_url ? (
                <img
                  src={photo.signed_url}
                  alt={photo.caption ?? "Garden photo"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon size={18} className="text-rhozly-on-surface/30" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                <p className="text-[9px] font-bold text-white truncate">
                  {new Date(photo.taken_at).toLocaleDateString()}
                </p>
              </div>
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  data-testid={`shape-photo-diagnose-${photo.id}`}
                  onClick={() => diagnoseFromPhoto(photo)}
                  disabled={!photo.signed_url}
                  aria-label="Diagnose this photo"
                  title="Open in Plant Doctor"
                  className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-full bg-white/90 text-rhozly-primary disabled:opacity-50"
                >
                  <Stethoscope size={12} />
                </button>
                <button
                  data-testid={`shape-photo-delete-${photo.id}`}
                  onClick={() => handleDelete(photo)}
                  disabled={deletingId === photo.id}
                  aria-label="Delete photo"
                  className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-full bg-white/90 text-red-500 disabled:opacity-50"
                >
                  {deletingId === photo.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
