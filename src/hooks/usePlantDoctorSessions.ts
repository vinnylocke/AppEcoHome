import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface PlantDoctorSession {
  id: string;
  user_id: string;
  home_id: string;
  action: "identify" | "diagnose";
  image_path: string | null;
  results: {
    notes?: string;
    possible_names?: string[];
    possible_diseases?: string[] | null;
  };
  confirmed_value: string | null;
  confirmed_at: string | null;
  created_at: string;
  imageUrl?: string | null;
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
          if (!s.image_path) return { ...s, imageUrl: null };
          const { data: urlData } = await supabase.storage
            .from("doctor-sessions")
            .createSignedUrl(s.image_path, 3600);
          return { ...s, imageUrl: urlData?.signedUrl ?? null };
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
