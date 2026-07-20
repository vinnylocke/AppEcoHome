import { supabase } from "./supabase";

/**
 * The four location mutations, in ONE place so the home garden grid (inline
 * add / manage — stats+locations redesign Stage 4b) and LocationManager
 * (`/management`) share a single DB contract instead of each hand-rolling the
 * `supabase.from("locations")` call.
 *
 * Each function performs ONLY the raw mutation and returns the Supabase
 * `{ error }` result — callers own the orchestration (permission `can()`
 * gating, toasts, analytics, and the post-mutation refresh). Permission
 * enforcement is the CALLER's job: RLS gates only home membership, not the
 * spatial permission keys, so every call site must guard with `can(...)`.
 */

/** Create a location under a home. Trims the name. */
export function createLocation(input: {
  name: string;
  isOutside: boolean;
  homeId: string;
}) {
  return supabase.from("locations").insert([
    {
      name: input.name.trim(),
      is_outside: input.isOutside,
      home_id: input.homeId,
    },
  ]);
}

/** Rename a location. Trims the name. */
export function renameLocation(id: string, name: string) {
  return supabase.from("locations").update({ name: name.trim() }).eq("id", id);
}

/** Flip a location's indoor/outdoor flag (drives weather-rule applicability). */
export function setLocationEnvironment(id: string, isOutside: boolean) {
  return supabase.from("locations").update({ is_outside: isOutside }).eq("id", id);
}

/** Delete a location (its areas + inventory cascade per the FK rules). */
export function deleteLocation(id: string) {
  return supabase.from("locations").delete().eq("id", id);
}
