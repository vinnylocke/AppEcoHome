import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // This ensures the session stays active even if the app is closed
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Helper to get the correct Redirect URL.
 * It detects if we are on localhost (Web) or a custom scheme (Mobile).
 */
export const getRedirectUrl = () => {
  let url =
    import.meta.env.VITE_SITE_URL ?? // Set this in your .env for production
    window.location.origin; // Fallback to current browser URL

  // Capacitor check: If the app is running in a native shell,
  // we will eventually change this to our deep-link scheme.
  // For now, it keeps your web logic clean.
  return url;
};
