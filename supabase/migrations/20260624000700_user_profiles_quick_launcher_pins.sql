-- Quick Launcher customisation — per-user pinned shortcut list for the
-- /quick mobile launcher. Shape: { "pinned": ["lens","today",…] }.
-- NULL = "use catalogue defaults"; no backfill required.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS quick_launcher_pins jsonb;

COMMENT ON COLUMN public.user_profiles.quick_launcher_pins IS
  'Ordered list of pinned Quick Launcher destination ids for /quick. Shape: { "pinned": ["lens","today",…] }. NULL = use defaults.';
