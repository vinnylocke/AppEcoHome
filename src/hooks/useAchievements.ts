import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { computeUnlocked, type AchievementStats } from "../lib/achievements";
import { getLocalDateString } from "../lib/taskEngine";

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
            .select("event_type, meta, created_at")
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
        let journalEntries = 0, yieldRecorded = 0, scansCompleted = 0;
        let guidesPublished = 0, commentsPosted = 0, chatMessages = 0;
        let blueprintCreatedFromEvents = 0;
        let hasWinterTask = false, hasSpringPlanting = false;
        const activityDates = new Set<string>();

        for (const e of events as any[]) {
          // Track dates for streak computation — on the user's LOCAL
          // calendar day. Slicing the UTC timestamp bucketed an 8:30pm EDT
          // completion into tomorrow, so a user gardening every evening in
          // the Americas could log on consecutive local days yet break
          // their streak.
          if (e.created_at) {
            activityDates.add(getLocalDateString(new Date(e.created_at)));
          }

          const month = e.created_at ? new Date(e.created_at).getUTCMonth() + 1 : 0;

          switch (e.event_type) {
            case "plant_added":              plantAdded++;                          break;
            case "task_completed":           taskCompleted++;
              if (e.meta?.task_type === "Pruning")    plantPruned++;
              if (e.meta?.task_type === "Harvesting") plantHarvested++;
              if ([12, 1, 2].includes(month))         hasWinterTask = true;
              break;
            case "plant_instance_planted":
              if ([3, 4, 5].includes(month)) hasSpringPlanting = true;
              break;
            case "ai_identify":              aiIdentify++;                          break;
            case "ai_diagnose":              aiDiagnose++;                          break;
            case "plan_completed":           planCompleted++;                       break;
            case "ailment_added":            ailmentAdded++;                        break;
            case "ailment_archived":         ailmentResolved++;                     break;
            case "journal_entry_added":      journalEntries++;                      break;
            case "yield_recorded":           yieldRecorded++;                       break;
            case "area_scan_completed":      scansCompleted++;                      break;
            case "guide_published":          guidesPublished++;                     break;
            case "guide_commented":          commentsPosted++;                      break;
            case "plant_doctor_chat_message": chatMessages++;                       break;
            case "blueprint_created":        blueprintCreatedFromEvents++;          break;
          }
        }

        // Compute gardening streak from sorted activity dates
        const sortedDates = [...activityDates].sort();
        let streakDays = 0, longestStreak = 0, currentRun = 0;
        for (let i = 0; i < sortedDates.length; i++) {
          if (i === 0) {
            currentRun = 1;
          } else {
            const prev = new Date(sortedDates[i - 1]);
            const curr = new Date(sortedDates[i]);
            const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
            currentRun = diffDays === 1 ? currentRun + 1 : 1;
          }
          if (currentRun > longestStreak) longestStreak = currentRun;
        }
        // Current streak: walk backwards from today
        const todayStr = getLocalDateString(new Date());
        let checkDate = todayStr;
        while (activityDates.has(checkDate)) {
          streakDays++;
          const d = new Date(checkDate);
          d.setUTCDate(d.getUTCDate() - 1);
          checkDate = d.toISOString().slice(0, 10);
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
          journalEntries,
          yieldRecorded,
          scansCompleted,
          guidesPublished,
          commentsPosted,
          chatMessages,
          streakDays,
          longestStreak,
          blueprintCreatedFromEvents,
          hasWinterTask,
          hasSpringPlanting,
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
