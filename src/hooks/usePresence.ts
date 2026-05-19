import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface PresentMember {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
}

/**
 * Subscribes to a Supabase Realtime Presence channel keyed by `channelKey`
 * (e.g. `plan:<planId>`). Tracks the current user and returns the list of
 * other members currently present on the same key.
 *
 * Skips entirely while no userId is available (initial auth load).
 */
export function usePresence(channelKey: string, userId: string | null): PresentMember[] {
  const [others, setOthers] = useState<PresentMember[]>([]);

  useEffect(() => {
    if (!userId || !channelKey) return;

    let cancelled = false;

    // Resolve display_name + avatar_url for the local user so other clients can
    // render us in their list. Best effort — if either is null the avatar fall
    // back to initials.
    let myMeta: { display_name: string | null; avatar_url: string | null } = {
      display_name: null,
      avatar_url:   null,
    };

    const channel = supabase.channel(channelKey, {
      config: { presence: { key: userId } },
    });

    const refreshOthers = () => {
      const state = channel.presenceState() as Record<string, any[]>;
      const next: PresentMember[] = [];
      for (const [uid, entries] of Object.entries(state)) {
        if (uid === userId) continue;
        const entry = entries[0] ?? {};
        next.push({
          user_id:      uid,
          display_name: entry.display_name ?? null,
          avatar_url:   entry.avatar_url ?? null,
          joined_at:    entry.joined_at ?? new Date().toISOString(),
        });
      }
      setOthers(next);
    };

    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_url")
        .eq("uid", userId)
        .maybeSingle();
      myMeta = {
        display_name: data?.display_name ?? null,
        avatar_url:   data?.avatar_url ?? null,
      };
      if (cancelled) return;

      channel
        .on("presence", { event: "sync" }, refreshOthers)
        .on("presence", { event: "join" }, refreshOthers)
        .on("presence", { event: "leave" }, refreshOthers)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              ...myMeta,
              joined_at: new Date().toISOString(),
            });
          }
        });
    })();

    return () => {
      cancelled = true;
      void channel.unsubscribe();
    };
  }, [channelKey, userId]);

  return others;
}
