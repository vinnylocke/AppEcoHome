import React, { useCallback, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";

interface PhotoUploaderProps {
  /** Supabase Storage bucket to upload to (e.g. "plant-images"). */
  bucket: string;
  /** Path prefix inside the bucket (e.g. "plant-photos"). */
  pathPrefix: string;
  /** Existing photo URL — if set, shown as the current photo. */
  value?: string | null;
  /** Called when the photo changes. Null means the user removed the photo. */
  onChange: (publicUrl: string | null) => void;
  /** Max file size in MB (default 5). */
  maxSizeMb?: number;
  /** Label shown on the dropzone (default "Add photo"). */
  label?: string;
  /** Aspect-ratio Tailwind class for the preview (default "aspect-square"). */
  aspectClass?: string;
  /** Optional test ID prefix to namespace the uploader's elements. */
  testIdPrefix?: string;
  /** Optional callback when the upload starts. */
  onUploadStart?: () => void;
  /** Optional callback when the upload finishes (success or failure). */
  onUploadEnd?: () => void;
  /** Disable the uploader (e.g. while a parent form is saving). */
  disabled?: boolean;
}

/**
 * Unified photo upload component.
 *
 * - File input, drag-and-drop, paste-from-clipboard
 * - Optimistic local preview while uploading
 * - Supabase Storage upload + public URL retrieval
 * - Progress bar
 * - Remove-photo affordance
 */
export default function PhotoUploader({
  bucket,
  pathPrefix,
  value,
  onChange,
  maxSizeMb = 5,
  label = "Add photo",
  aspectClass = "aspect-square",
  testIdPrefix = "photo-uploader",
  onUploadStart,
  onUploadEnd,
  disabled = false,
}: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const acceptFile = useCallback(
    async (file: File) => {
      if (disabled) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file.");
        return;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`Image must be under ${maxSizeMb}MB.`);
        return;
      }

      // Show local preview immediately while the upload runs.
      const localUrl = URL.createObjectURL(file);
      setLocalPreview(localUrl);

      setUploading(true);
      setProgress(0);
      onUploadStart?.();

      const progressInterval = window.setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + 10));
      }, 100);

      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const path = `${pathPrefix.replace(/\/+$/, "")}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, { contentType: file.type, upsert: false });

        window.clearInterval(progressInterval);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(path);

        setProgress(100);
        onChange(publicUrl);
        toast.success("Photo attached.");
      } catch (err: unknown) {
        window.clearInterval(progressInterval);
        Logger.error("PhotoUploader upload failed", err, { bucket, pathPrefix }, "Failed to upload photo.");
        // Revert local preview on failure
        setLocalPreview(null);
      } finally {
        setUploading(false);
        onUploadEnd?.();
        // Local preview can be revoked once Supabase URL is in use, but the
        // parent component now owns `value`. Clean up the object URL.
        window.setTimeout(() => {
          if (localUrl) URL.revokeObjectURL(localUrl);
          setLocalPreview(null);
        }, 500);
      }
    },
    [bucket, pathPrefix, maxSizeMb, onChange, onUploadStart, onUploadEnd, disabled],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) acceptFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const item = Array.from(e.clipboardData.items || []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) acceptFile(file);
  };

  const handleRemove = () => {
    if (disabled || uploading) return;
    onChange(null);
  };

  const previewUrl = localPreview ?? value ?? null;

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!previewUrl) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        tabIndex={0}
        role="region"
        aria-label={label}
        className={`relative ${aspectClass} w-full rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 text-center px-4
          ${isDragging ? "border-rhozly-primary bg-rhozly-primary/5" : "border-rhozly-outline/30 bg-rhozly-surface-low/30"}
          ${disabled ? "opacity-50 pointer-events-none" : "hover:border-rhozly-primary/50 hover:bg-rhozly-primary/5"}`}
        data-testid={`${testIdPrefix}-dropzone`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileInput}
          data-testid={`${testIdPrefix}-file-input`}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileInput}
          data-testid={`${testIdPrefix}-camera-input`}
        />
        <ImageIcon size={24} className="text-rhozly-on-surface/40" />
        <p className="text-sm font-black text-rhozly-on-surface">{label}</p>
        <p className="text-[11px] font-medium text-rhozly-on-surface/50 leading-snug">
          Tap to choose, drag a file in, or paste from clipboard
        </p>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-black hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[36px]"
            data-testid={`${testIdPrefix}-choose-file`}
          >
            <Upload size={13} />
            Choose file
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rhozly-outline/30 text-rhozly-on-surface text-xs font-black hover:bg-rhozly-surface-low transition-colors disabled:opacity-50 min-h-[36px]"
            data-testid={`${testIdPrefix}-take-photo`}
          >
            <Camera size={13} />
            Camera
          </button>
        </div>
      </div>
    );
  }

  // ── Has photo ───────────────────────────────────────────────────────────
  return (
    <div
      className={`relative ${aspectClass} w-full rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/15`}
      data-testid={`${testIdPrefix}-preview`}
    >
      <img
        src={previewUrl}
        alt="Selected photo"
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Uploading overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
          <Loader2 size={22} className="animate-spin text-white" />
          <div className="w-2/3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/90">
            Uploading {progress}%
          </p>
        </div>
      )}

      {/* Remove + replace controls */}
      {!uploading && (
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Replace photo"
            className="p-2 rounded-xl bg-white/85 backdrop-blur-sm text-rhozly-on-surface hover:bg-white shadow-sm transition-colors disabled:opacity-50"
            data-testid={`${testIdPrefix}-replace`}
          >
            <Upload size={14} />
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label="Remove photo"
            className="p-2 rounded-xl bg-red-500/90 backdrop-blur-sm text-white hover:bg-red-600 shadow-sm transition-colors disabled:opacity-50"
            data-testid={`${testIdPrefix}-remove`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileInput}
        data-testid={`${testIdPrefix}-file-input`}
      />
    </div>
  );
}
