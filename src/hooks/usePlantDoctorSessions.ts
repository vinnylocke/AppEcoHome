import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

// Candidates stored before confidence scores were added were plain strings;
// newer entries are objects. Both formats must be handled.
export type SessionCandidate = string | { name: string; scientific_name?: string; confidence?: number };

/** A detected plant in a Multi-ID ("scene") session — box + ranked candidates. */
export interface SessionRegion {
  box: number[];
  candidates: SessionCandidate[];
}

export interface PlantDoctorSession {
  id: string;
  user_id: string;
  home_id: string;
  action: "identify" | "diagnose" | "pest" | "scene" | "analyse";
  image_path: string | null;
  /** Wave-19: up to 5 storage paths for multi-photo sessions. Single-photo
   *  sessions either omit this column or set it to `[image_path]`. */
  image_paths?: string[] | null;
  results: {
    notes?: string;
    possible_names?: SessionCandidate[];
    possible_diseases?: SessionCandidate[] | null;
    possible_pests?: SessionCandidate[];
    is_pest?: boolean;
    pest_severity?: string | null;
    // Multi-ID ("scene") sessions:
    regions?: SessionRegion[];
    /** regionIndex (as string, jsonb key) → confirmed candidate name. */
    confirmed?: Record<string, string>;
  };
  /** Wave-19: Pl@ntNet provenance block. Null for AI-only sessions. */
  plantnet_result?: {
    best_match: { score: number; commonName: string | null; scientificName: string } | null;
    top_matches: Array<{ score: number; commonName: string | null; scientificName: string }>;
    identification_source: "plantnet" | "plantnet+ai_confirmed" | "plantnet_vs_ai_disagreement" | "ai_fallback";
    ai_suggested_name: string | null;
    remaining_requests: number | null;
  } | null;
  confirmed_value: string | null;
  confirmed_at: string | null;
  created_at: string;
  imageUrl?: string | null;
  /** Wave-19: signed URLs for every photo on the session. `imageUrls[0]`
   *  mirrors `imageUrl` for back-compat. */
  imageUrls?: string[];
}

export function usePlantDoctorSessions(userId: string | null) {
  const [sessions, setSessions] = useState<PlantDoctorSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("plant_doctor_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const enriched = await Promise.all(
        (data ?? []).map(async (s: PlantDoctorSession) => {
          // Wave-19: sign every photo path. Multi-photo sessions populate
          // `image_paths`; single-photo sessions fall back to `image_path`.
          const paths: string[] = Array.isArray(s.image_paths) && s.image_paths.length > 0
            ? s.image_paths
            : s.image_path
              ? [s.image_path]
              : [];
          if (paths.length === 0) return { ...s, imageUrl: null, imageUrls: [] };
          const signed = await Promise.all(
            paths.map((p) =>
              supabase.storage.from("doctor-sessions").createSignedUrl(p, 3600),
            ),
          );
          const imageUrls = signed.map((r) => r.data?.signedUrl).filter((u): u is string => !!u);
          return { ...s, imageUrl: imageUrls[0] ?? null, imageUrls };
        }),
      );
      setSessions(enriched);
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const confirmSession = useCallback(
    async (sessionId: string, value: string) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("plant_doctor_sessions")
        .update({ confirmed_value: value, confirmed_at: now })
        .eq("id", sessionId)
        .eq("user_id", userId);
      if (!error) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, confirmed_value: value, confirmed_at: now }
              : s,
          ),
        );
      }
    },
    [userId],
  );

  return { sessions, isLoading, load, confirmSession };
}
