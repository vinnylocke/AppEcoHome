-- ============================================================
-- SHOPPING LISTS
-- Two tables: shopping_lists (headers) and shopping_list_items (rows)
-- All writes are plain CRUD from the browser via the Supabase client.
-- No Edge Function required.
-- ============================================================

-- 1. shopping_lists ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id    uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT 'My List',
  status     text        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_shopping_lists"
  ON public.shopping_lists FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_shopping_lists"
  ON public.shopping_lists FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_shopping_lists"
  ON public.shopping_lists FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_shopping_lists"
  ON public.shopping_lists FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_shopping_lists_home_id
  ON public.shopping_lists (home_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO service_role;


-- 2. shopping_list_items ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id         uuid        NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  home_id         uuid        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,

  -- Discriminated union: either 'plant' or 'product'
  item_type       text        NOT NULL CHECK (item_type IN ('plant', 'product')),

  -- Shared
  name            text        NOT NULL,
  is_checked      boolean     NOT NULL DEFAULT false,

  -- Plant-only (null for product items)
  perenual_id     integer,
  thumbnail_url   text,
  source          text,          -- 'shed' | 'perenual' | 'ai'
  already_in_shed boolean,       -- true when item came from inventory_items

  -- Product-only (null for plant items)
  category        text,          -- must match a value in SHOPPING_CATEGORIES

  -- Plant Doctor provenance (optional, for both types)
  doctor_session_id text,        -- free-text reference, not a FK

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_shopping_list_items"
  ON public.shopping_list_items FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_shopping_list_items"
  ON public.shopping_list_items FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_shopping_list_items"
  ON public.shopping_list_items FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_shopping_list_items"
  ON public.shopping_list_items FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id
  ON public.shopping_list_items (list_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_home_id
  ON public.shopping_list_items (home_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO service_role;
