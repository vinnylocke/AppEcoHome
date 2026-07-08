import toast from "react-hot-toast";
import { isOffline } from "../hooks/useOnline";

/**
 * Gate for internet-only features (offline-first Phase 1).
 *
 * Call at the top of an action handler that needs a live connection (any AI
 * edge function, plant search/library, weather refresh, image upload,
 * integrations pairing, invites, export). Returns `true` when it's safe to
 * proceed, or shows a friendly toast and returns `false` when offline.
 *
 *   if (!requireOnline("Plant Doctor")) return;
 *   const { data } = await supabase.functions.invoke("plant-doctor", …);
 *
 * `label` names the feature so the message is specific:
 *   "You're offline — Plant Doctor needs a connection."
 */
export function requireOnline(label: string): boolean {
  if (isOffline()) {
    toast.error(`You're offline — ${label} needs a connection.`, {
      id: `offline-gate-${label}`, // dedupe rapid re-taps
    });
    return false;
  }
  return true;
}
