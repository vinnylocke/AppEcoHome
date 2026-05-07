import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { computeUnlocked, type AchievementStats } from "../lib/achievements";

export interface AchievementsResult {
  stats: AchievementStats | null;
  unlockedKeys: string[];
  unlockedAt: Record<string, string>;
  isLoading: boolean;
  reload: () => void;
}

export function useAchievements(userId: string | null, homeId: string | null): AchievementsResult {
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [unlockedKeys, setUnlockedKeys] = useState<string[]>([]);
  const [unlockedAt, setUnlockedAt] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [eventsRes, blueprintsRes, quizRes, existingRes] = await Promise.all([
          supabase
            .from("user_events")
            .select("event_type, meta")
            .eq("user_id", userId!),
          supabase
            .from("task_blueprints")
            .select("id", { count: "exact", head: true })
            .eq("created_by", userId!),
          homeId
            ? supabase
                .from("home_quiz_completions")
                .select("id")
                .eq("user_id", userId!)
                .eq("home_id", homeId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from("user_achievements")
            .select("achievement_key, unlocked_at")
            .eq("user_id", userId!),
        ]);

        if (cancelled) return;

        // Tally event counts
        const events = eventsRes.data ?? [];
        let plantAdded = 0, taskCompleted = 0, aiIdentify = 0, aiDiagnose = 0;
        let planCompleted = 0, ailmentAdded = 0, ailmentResolved = 0;
        let plantPruned = 0, plantHarvested = 0;

        for (const e of events) {
          switch (e.event_type) {
            case "plant_added":       plantAdded++;      break;
            case "task_completed":    taskCompleted++;
              if (e.meta?.task_type === "prune")   plantPruned++;
              if (e.meta?.task_type === "harvest") plantHarvested++;
              break;
            case "ai_identify":      aiIdentify++;      break;
            case "ai_diagnose":      aiDiagnose++;      break;
            case "plan_completed":   planCompleted++;   break;
            case "ailment_added":    ailmentAdded++;    break;
            case "ailment_archived": ailmentResolved++; break;
          }
        }

        const computed: AchievementStats = {
          plantAdded,
          plantPruned,
          plantHarvested,
          taskCompleted,
          aiIdentify,
          aiDiagnose,
          planCompleted,
          blueprintCreated: blueprintsRes.count ?? 0,
          ailmentAdded,
          ailmentResolved,
          profileComplete: !!quizRes.data,
        };

        setStats(computed);

        // Determine newly unlocked keys and upsert them
        const nowUnlocked = computeUnlocked(computed);
        const alreadyInDb = new Set((existingRes.data ?? []).map((r: { achievement_key: string }) => r.achievement_key));
        const newOnes = nowUnlocked.filter((k) => !alreadyInDb.has(k));

        if (newOnes.length > 0) {
          await supabase.from("user_achievements").upsert(
            newOnes.map((key) => ({ user_id: userId!, achievement_key: key })),
            { onConflict: "user_id,achievement_key" }
          );
        }

        // Fetch final list with timestamps
        const { data: finalRows } = await supabase
          .from("user_achievements")
          .select("achievement_key, unlocked_at")
          .eq("user_id", userId!);

        if (!cancelled && finalRows) {
          const atMap: Record<string, string> = {};
          for (const r of finalRows) atMap[r.achievement_key] = r.unlocked_at;
          setUnlockedKeys(Object.keys(atMap));
          setUnlockedAt(atMap);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userId, homeId, tick]);

  return { stats, unlockedKeys, unlockedAt, isLoading, reload: () => setTick((t) => t + 1) };
}
