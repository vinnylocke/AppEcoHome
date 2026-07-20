import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { UserProfile } from "../types";

type Persona = UserProfile["persona"];

/**
 * Lightweight read-only persona hook. Loads the caller's persona
 * value from user_profiles once and caches in module memory so
 * subsequent calls return immediately.
 *
 * Components that need write access should use `useFirstRunState`
 * — this hook is intentionally minimal for surfaces that only need
 * to know whether to bias copy.
 *
 * Returns `null` while loading or when the user hasn't declared a
 * persona. Treat null as "new" by default — that's the safer
 * fallback (more guidance for unfamiliar users).
 */

let cachedPersona: Persona | undefined;
const subscribers = new Set<(p: Persona) => void>();

async function loadPersona(): Promise<Persona> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return null;
    const { data: row } = await supabase
      .from("user_profiles")
      .select("persona")
      .eq("uid", uid)
      .maybeSingle();
    return (row?.persona as Persona) ?? null;
  } catch {
    return null;
  }
}

export function usePersona(): Persona {
  const [persona, setPersona] = useState<Persona>(cachedPersona ?? null);

  useEffect(() => {
    if (cachedPersona !== undefined) return;
    let cancelled = false;
    loadPersona().then((next) => {
      if (cancelled) return;
      cachedPersona = next;
      setPersona(next);
      subscribers.forEach((cb) => cb(next));
    });
    return () => { cancelled = true; };
  }, []);

  // Subscribe so persona changes (e.g. from PersonaSetting) propagate
  // to every consumer without a page reload.
  useEffect(() => {
    const cb = (next: Persona) => setPersona(next);
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  }, []);

  return persona;
}

/**
 * Imperatively update the cached persona — used by PersonaSetting
 * after a successful write so dependent components re-render
 * without re-fetching.
 */
export function notifyPersonaChanged(next: Persona): void {
  cachedPersona = next;
  subscribers.forEach((cb) => cb(next));
}

/**
 * Seed the cache from an already-fetched profile row (App.tsx's profile
 * select includes `persona`). Because App gates the routes on the profile,
 * this runs BEFORE any consumer mounts — so usePersona() returns the real
 * value on its very first render and persona-composed surfaces (the home
 * postures) never flash the wrong layout while a duplicate fetch resolves.
 * No-ops once a value is cached (a later PersonaSetting write still wins
 * via notifyPersonaChanged).
 */
export function primePersona(fromProfile: Persona): void {
  if (cachedPersona !== undefined) return;
  cachedPersona = fromProfile;
  subscribers.forEach((cb) => cb(fromProfile));
}

/**
 * Reconcile the cache with a freshly-FETCHED profile row (App's loadProfile —
 * including the background refresh after a cache boot). Unlike primePersona
 * it also UPDATES when the fetched value differs, so a persona changed on
 * another device propagates this session instead of lagging until the next
 * launch (review finding, Stage 0-2). Same-device flips still go through
 * notifyPersonaChanged in PersonaSetting.
 */
export function syncPersonaFromProfile(fetched: Persona): void {
  if (cachedPersona === undefined) {
    primePersona(fetched);
    return;
  }
  if (cachedPersona !== fetched) {
    notifyPersonaChanged(fetched);
  }
}

/** Test-only — clear module cache between tests. */
export function __resetPersonaCacheForTests(): void {
  cachedPersona = undefined;
}
