import { supabase } from "../lib/supabase";
import type { SketchDetection } from "../lib/garden/sketchToShapes";

export interface SketchDetectInput {
  homeId: string;
  /** Raw base64 (no `data:` prefix), as produced by the wizard's resize step. */
  sketchBase64: string;
  mimeType: string;
}

export interface SketchDetectResult {
  /** Validated, NORMALIZED (0..1) detection. Null when the sketch was
   *  unreadable — the wizard then offers a blank layout instead. */
  detection: SketchDetection | null;
  /** Signed URL of the stored original sketch (private bucket). */
  sketch_url: string;
}

/**
 * Send a hand-drawn top-down sketch to the `sketch-to-layout` edge fn.
 * Sage+ tier, home membership, and rate limits are enforced server-side; a
 * non-Sage caller / non-member / rate-limit surfaces as a thrown error here.
 */
export async function detectSketch(
  input: SketchDetectInput,
): Promise<SketchDetectResult> {
  const { data, error } = await supabase.functions.invoke("sketch-to-layout", {
    body: {
      homeId: input.homeId,
      sketchBase64: input.sketchBase64,
      mimeType: input.mimeType,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as SketchDetectResult;
}
