// Client wrapper for the Nursery scan flow.
//
// Responsibilities:
//   1. Compress a captured image to ~800px wide @ 70% JPEG so it fits
//      comfortably under the edge fn's 2 MB cap. (Same recipe as
//      PlantDoctorChat's existing `compressImage` helper.)
//   2. Invoke the `scan-seed-packet` edge fn with the base64 payload.
//   3. Upload the compressed JPEG to the `seed-packet-images` storage
//      bucket on save, scoped by `home_id/packet_id.jpg`.
//
// The capture step itself (Capacitor camera vs web file input) lives in
// the modal — this lib starts from a `File | Blob | base64-string` and
// returns the artefacts the modal needs.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";

export interface CompressedImage {
  /** Raw base64 (no data-URL prefix) — sent to the edge fn. */
  base64: string;
  /** Blob suitable for the Storage upload step. */
  blob: Blob;
  /** Object URL for the modal's preview. Caller revokes when done. */
  previewUrl: string;
  /** Always "image/jpeg" — we force JPEG to keep server-side handling simple. */
  mimeType: "image/jpeg";
}

/**
 * Compress a captured File into ~800px wide JPEG, returning both the
 * base64 (for the edge fn) and a Blob (for the Storage upload).
 */
export function compressPacketImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_W = 800;
      const scale = Math.min(1, MAX_W / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(img.src);
        return reject(new Error("Canvas not available"));
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (!blob) return reject(new Error("Image compression failed"));
          resolve({
            base64: dataUrl.split(",")[1] ?? "",
            blob,
            previewUrl: URL.createObjectURL(blob),
            mimeType: "image/jpeg",
          });
        },
        "image/jpeg",
        0.7,
      );
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(img.src);
      reject(err);
    };
  });
}

/**
 * Compress a base64 string (e.g. from Capacitor camera result) the same
 * way — wraps it as a File and reuses `compressPacketImage`.
 */
export async function compressPacketBase64(
  base64: string,
  mimeType: string = "image/jpeg",
): Promise<CompressedImage> {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
  const byteString = atob(cleaned);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const file = new File([blob], "packet.jpg", { type: mimeType });
  return compressPacketImage(file);
}

// ── Edge fn invocation ─────────────────────────────────────────────────────

export type ScanConfidence = "high" | "medium" | "low";

export interface ScannedSeedPacket {
  common_name: string;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
}

export interface ScanResult {
  packet: ScannedSeedPacket | null;
  confidence: ScanConfidence;
  unreadable?: boolean;
}

export async function scanSeedPacket(
  homeId: string,
  primary: CompressedImage,
  extra?: CompressedImage,
): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke("scan-seed-packet", {
    body: {
      homeId,
      imageBase64: primary.base64,
      mimeType: primary.mimeType,
      ...(extra
        ? { extraImageBase64: extra.base64, extraMimeType: extra.mimeType }
        : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as ScanResult;
}

// ── Storage upload ────────────────────────────────────────────────────────

/**
 * Upload a packet image to the `seed-packet-images` bucket. The bucket
 * is public, so we return the resolved public URL.
 *
 * Path: `{home_id}/{packet_id}.jpg`. Re-uploading to the same path
 * overwrites the previous image (used for "retake" / replace flows).
 */
export async function uploadPacketImage(opts: {
  homeId: string;
  packetId: string;
  blob: Blob;
}): Promise<string | null> {
  try {
    const path = `${opts.homeId}/${opts.packetId}.jpg`;
    const { error } = await supabase.storage
      .from("seed-packet-images")
      .upload(path, opts.blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
    if (error) throw error;
    const { data: pub } = supabase.storage
      .from("seed-packet-images")
      .getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (err) {
    Logger.error("uploadPacketImage failed", err, {
      packetId: opts.packetId,
    });
    return null;
  }
}
