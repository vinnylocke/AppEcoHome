import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Camera as CameraIcon, ImagePlus, Loader2, Check, AlertCircle,
  RefreshCw, Package, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import {
  compressPacketImage,
  compressPacketBase64,
  scanSeedPacket,
  uploadPacketImage,
  type CompressedImage,
  type ScannedSeedPacket,
  type ScanConfidence,
} from "../../lib/scanSeedPacket";
import {
  createSeedPacket,
  setSeedPacketImageUrl,
} from "../../services/nurseryService";

interface Props {
  homeId: string;
  onClose: () => void;
  onCreated?: (packetId: string) => void;
}

type Step = "capture" | "scanning" | "review" | "error";

/**
 * Scan a seed packet — Sage+ Gemini Vision flow for The Nursery.
 *
 *   capture  → user picks the packet image (camera or library)
 *   scanning → image compressed, sent to scan-seed-packet edge fn
 *   review   → editable form pre-filled with Gemini's extraction
 *   error    → "Couldn't read" with retake / type-it-in fallback
 *
 * On Save we insert the packet first (so we have an id for the
 * Storage path), then upload the compressed JPEG to
 * `seed-packet-images/{home_id}/{packet_id}.jpg`, then patch
 * `image_url` on the row. Upload failures are non-fatal — the packet
 * still saves cleanly with `image_url = null`.
 */
export default function ScanSeedPacketModal({
  homeId, onClose, onCreated,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<ScanConfidence | null>(null);
  const [form, setForm] = useState<ScannedSeedPacket>({
    common_name: "",
    variety: null,
    vendor: null,
    purchased_on: null,
    opened_on: null,
    sow_by: null,
    quantity_remaining: null,
    notes: null,
  });
  const [saving, setSaving] = useState(false);

  // Revoke the object URL on unmount / replacement so we don't leak.
  useEffect(() => {
    return () => {
      if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image?.previewUrl]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  // ── Capture helpers ─────────────────────────────────────────────────────

  const handleCameraCapture = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt,
        });
        if (!photo.base64String) return;
        const mime = `image/${photo.format ?? "jpeg"}`;
        const compressed = await compressPacketBase64(photo.base64String, mime);
        replaceImage(compressed);
        runScan(compressed);
      } catch {
        // user cancelled — no-op
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-pick of the same file
    if (!file) return;
    try {
      const compressed = await compressPacketImage(file);
      replaceImage(compressed);
      runScan(compressed);
    } catch (err) {
      Logger.error("ScanSeedPacketModal compress failed", err);
      toast.error("Couldn't process that image — try a different one.");
    }
  };

  const replaceImage = (next: CompressedImage) => {
    setImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
  };

  // ── Scan ────────────────────────────────────────────────────────────────

  const runScan = async (img: CompressedImage) => {
    setStep("scanning");
    setErrorMessage(null);
    setConfidence(null);
    try {
      const result = await scanSeedPacket(homeId, img);
      if (!result.packet || result.unreadable) {
        setErrorMessage(
          "We couldn't read this packet clearly. Try a sharper, well-lit photo of the front of the packet.",
        );
        setStep("error");
        return;
      }
      setConfidence(result.confidence);
      setForm({
        common_name: result.packet.common_name,
        variety: result.packet.variety,
        vendor: result.packet.vendor,
        purchased_on: result.packet.purchased_on,
        opened_on: result.packet.opened_on,
        sow_by: result.packet.sow_by,
        quantity_remaining: result.packet.quantity_remaining,
        notes: result.packet.notes,
      });
      setStep("review");
    } catch (err) {
      Logger.error("ScanSeedPacketModal scan failed", err, { homeId });
      setErrorMessage(err instanceof Error ? err.message : "Couldn't extract details.");
      setStep("error");
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.common_name.trim()) {
      toast.error("Plant name is required — fill that in and try again.");
      return;
    }
    setSaving(true);
    try {
      // Title for the toast — fall back to plant name if no variety.
      const headline = form.variety?.trim() || form.common_name;

      // Bulk-paste rows stash the scanned plant name in notes so the
      // user can later link a Library plant. We do the same here.
      const provenance = `Scanned packet — plant: "${form.common_name.trim()}".`;
      const mergedNotes = form.notes?.trim()
        ? `${form.notes.trim()}\n${provenance}`
        : provenance;

      const packet = await createSeedPacket({
        home_id: homeId,
        plant_id: null,
        variety: form.variety?.trim() || null,
        vendor: form.vendor?.trim() || null,
        purchased_on: form.purchased_on,
        opened_on: form.opened_on,
        sow_by: form.sow_by,
        quantity_remaining: form.quantity_remaining?.trim() || null,
        notes: mergedNotes,
      });
      logEvent(EVENT.NURSERY_PACKET_ADDED, {
        via: "scan",
        confidence: confidence ?? "unknown",
      });

      // Upload the captured image once we have the packet id — non-
      // fatal on failure.
      if (image) {
        const publicUrl = await uploadPacketImage({
          homeId,
          packetId: packet.id,
          blob: image.blob,
        });
        if (publicUrl) {
          try {
            await setSeedPacketImageUrl(packet.id, publicUrl);
          } catch (urlErr) {
            Logger.error("Set packet image URL failed", urlErr, { packetId: packet.id });
          }
        }
      }

      toast.success(`Scanned ${headline} into your Nursery.`);
      onCreated?.(packet.id);
      onClose();
    } catch (err) {
      Logger.error("ScanSeedPacketModal save failed", err, { homeId });
      toast.error("Couldn't save the packet — try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return createPortal(
    <div
      data-testid="scan-seed-packet-modal"
      className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5 flex items-center gap-1">
              <Sparkles size={11} />
              Scan a packet
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-lg leading-tight">
              {step === "capture" && "Take or pick a photo"}
              {step === "scanning" && "Reading the packet…"}
              {step === "review" && "Check the details"}
              {step === "error" && "Couldn't read this one"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Photo preview — always visible once we have one */}
          {image && (
            <div className="rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/15 aspect-[4/3] flex items-center justify-center">
              <img
                src={image.previewUrl}
                alt="Captured packet"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {step === "capture" && (
            <CaptureStep onCamera={handleCameraCapture} />
          )}

          {step === "scanning" && (
            <div className="flex flex-col items-center gap-2 py-6 text-rhozly-on-surface/70">
              <Loader2 size={22} className="animate-spin text-rhozly-primary" />
              <p className="text-xs font-bold">Extracting details from the photo…</p>
              <p className="text-[11px] text-rhozly-on-surface/55">
                Usually 3-6 seconds.
              </p>
            </div>
          )}

          {step === "error" && (
            <ErrorStep
              message={errorMessage}
              onRetake={() => {
                setErrorMessage(null);
                setStep("capture");
              }}
            />
          )}

          {step === "review" && (
            <ReviewStep
              form={form}
              setForm={setForm}
              confidence={confidence}
              onRetake={() => {
                setErrorMessage(null);
                setStep("capture");
              }}
            />
          )}
        </div>

        {/* Hidden file input for the web path */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
          data-testid="scan-seed-packet-file-input"
        />

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            Cancel
          </button>
          {step === "review" && (
            <button
              type="button"
              data-testid="scan-seed-packet-save"
              onClick={handleSave}
              disabled={saving || !form.common_name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save packet
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────

function CaptureStep({ onCamera }: { onCamera: () => void }) {
  const nativeLabel = Capacitor.isNativePlatform()
    ? "Open camera"
    : "Take or pick a photo";
  return (
    <div className="space-y-3 text-center">
      <p className="text-xs text-rhozly-on-surface/65 leading-snug">
        Hold the packet front in good light. We'll extract the variety,
        vendor, sow-by date and any seed count — you'll see everything to
        review before saving.
      </p>
      <button
        type="button"
        data-testid="scan-seed-packet-capture"
        onClick={onCamera}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-95 transition"
      >
        {Capacitor.isNativePlatform() ? <CameraIcon size={16} /> : <ImagePlus size={16} />}
        {nativeLabel}
      </button>
    </div>
  );
}

function ErrorStep({
  message, onRetake,
}: {
  message: string | null;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-snug">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <span>{message ?? "We couldn't extract details from this photo."}</span>
      </div>
      <button
        type="button"
        data-testid="scan-seed-packet-retake"
        onClick={onRetake}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition"
      >
        <RefreshCw size={13} />
        Retake photo
      </button>
      <p className="text-[11px] text-rhozly-on-surface/55 text-center leading-snug">
        You can also add the packet manually via{" "}
        <span className="font-black text-rhozly-on-surface/75">Add packets</span> on the Nursery.
      </p>
    </div>
  );
}

function ReviewStep({
  form, setForm, confidence, onRetake,
}: {
  form: ScannedSeedPacket;
  setForm: React.Dispatch<React.SetStateAction<ScannedSeedPacket>>;
  confidence: ScanConfidence | null;
  onRetake: () => void;
}) {
  const set = <K extends keyof ScannedSeedPacket>(key: K, value: ScannedSeedPacket[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3">
      {confidence === "medium" && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 leading-snug">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>
            We weren't 100% sure on every field — give it a quick review before saving.
          </span>
        </div>
      )}
      {confidence === "low" && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 leading-snug">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>
            We only got a bit from this photo. You can fill in the gaps below or{" "}
            <button
              type="button"
              onClick={onRetake}
              className="underline font-black hover:text-amber-700"
            >
              retake
            </button>
            .
          </span>
        </div>
      )}

      <Field label="Plant" required testId="scan-field-common">
        <input
          type="text"
          value={form.common_name}
          onChange={(e) => set("common_name", e.target.value)}
          className={inputCx}
        />
      </Field>

      <Field label="Variety" testId="scan-field-variety">
        <input
          type="text"
          value={form.variety ?? ""}
          onChange={(e) => set("variety", e.target.value || null)}
          className={inputCx}
        />
      </Field>

      <Field label="Vendor" testId="scan-field-vendor">
        <input
          type="text"
          value={form.vendor ?? ""}
          onChange={(e) => set("vendor", e.target.value || null)}
          className={inputCx}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sow by" testId="scan-field-sow-by">
          <input
            type="date"
            value={form.sow_by ?? ""}
            onChange={(e) => set("sow_by", e.target.value || null)}
            className={inputCx}
          />
        </Field>
        <Field label="Quantity" testId="scan-field-qty">
          <input
            type="text"
            value={form.quantity_remaining ?? ""}
            onChange={(e) => set("quantity_remaining", e.target.value || null)}
            placeholder="e.g. ~30 seeds"
            className={inputCx}
          />
        </Field>
      </div>

      <Field label="Notes" testId="scan-field-notes">
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          rows={2}
          className={`${inputCx} resize-none`}
        />
      </Field>

      <button
        type="button"
        onClick={onRetake}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/70 text-[10px] font-black uppercase tracking-widest hover:border-rhozly-primary/30 transition"
      >
        <RefreshCw size={11} />
        Retake photo
      </button>
    </div>
  );
}

const inputCx =
  "w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15";

function Field({
  label, required, testId, children,
}: {
  label: string;
  required?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
        {label}
        {!required && (
          <span className="text-rhozly-on-surface/30 normal-case font-bold ml-1">(optional)</span>
        )}
      </label>
      {children}
    </div>
  );
}
