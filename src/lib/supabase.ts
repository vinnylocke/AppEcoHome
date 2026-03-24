import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log("--- Supabase Debug ---");
console.log("URL:", import.meta.env.VITE_SUPABASE_URL);
console.log(
  "Key Prefix:",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.slice(0, 12),
);
console.log(
  "Is Secret Key?:",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_"),
);

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
