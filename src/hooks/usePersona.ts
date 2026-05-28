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

/** Test-only — clear module cache between tests. */
export function __resetPersonaCacheForTests(): void {
  cachedPersona = undefined;
}
