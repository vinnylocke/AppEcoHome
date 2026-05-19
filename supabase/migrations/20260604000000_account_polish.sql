-- ============================================================
-- ACCOUNT POLISH (Phase 2 Wave 6)
-- - Avatar URL on user_profiles (6A)
-- - Quantity field on shopping list items (6D)
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS quantity numeric;

COMMENT ON COLUMN public.user_profiles.avatar_url IS
  'Profile photo URL chosen by the user. Null = use the default avatar.';

COMMENT ON COLUMN public.shopping_list_items.quantity IS
  'Optional numeric quantity (number of items, weight, etc). Displayed alongside the item name.';
