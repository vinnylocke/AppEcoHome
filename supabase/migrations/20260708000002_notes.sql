-- ─── Wave 22.0001-B — Notes ─────────────────────────────────────────────
--
-- Free-form notes with rich text (TipTap JSON), polymorphic many-to-many
-- links to plants / locations / areas / plans / ailments / seed packets.
-- Lives alongside the Journal (which is event-anchored / one-target).
--
-- Notes are home-scoped (any member can see all notes for the home);
-- the `user_id` column records the author for audit but doesn't gate
-- visibility — same model as plant_journals.

CREATE TABLE IF NOT EXISTS public.notes (
  id              uuid primary key default gen_random_uuid(),
  home_id         uuid not null references public.homes(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  title           text,
  -- TipTap document JSON.
  content         jsonb not null default '{}'::jsonb,
  -- Plain-text projection of `content` for client-side search.
  -- Kept in sync from the client on every save.
  body_text       text,
  -- First image URL from the document — used as the list thumbnail.
  cover_image_url text,
  pinned          boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS notes_home_updated_idx
  ON public.notes (home_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS notes_pinned_idx
  ON public.notes (home_id, pinned)
  WHERE pinned = true AND archived_at IS NULL;

-- Polymorphic links. `target_id` is text so we can store both uuid
-- (plant_instances, locations, areas, plans, ailments, seed_packets)
-- AND integer (`plants.id`) without two columns.
CREATE TABLE IF NOT EXISTS public.note_links (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  target_type text not null check (target_type in (
    'plant_instance',
    'plant',
    'location',
    'area',
    'plan',
    'ailment',
    'seed_packet'
  )),
  target_id   text not null,
  created_at  timestamptz not null default now(),
  unique (note_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS note_links_target_idx
  ON public.note_links (target_type, target_id);

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION public.touch_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_touch_updated_at ON public.notes;
CREATE TRIGGER notes_touch_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notes_updated_at();

-- ── RLS ──
ALTER TABLE public.notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated WITH CHECK (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY notes_update ON public.notes
  FOR UPDATE TO authenticated USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY notes_delete ON public.notes
  FOR DELETE TO authenticated USING (
    home_id IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY note_links_select ON public.note_links
  FOR SELECT TO authenticated USING (
    note_id IN (
      SELECT id FROM public.notes
       WHERE home_id IN (
         SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
       )
    )
  );

CREATE POLICY note_links_insert ON public.note_links
  FOR INSERT TO authenticated WITH CHECK (
    note_id IN (
      SELECT id FROM public.notes
       WHERE home_id IN (
         SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
       )
    )
  );

CREATE POLICY note_links_delete ON public.note_links
  FOR DELETE TO authenticated USING (
    note_id IN (
      SELECT id FROM public.notes
       WHERE home_id IN (
         SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
       )
    )
  );

-- ── Data API grants (post-2026-10-30 requirement, CLAUDE.md) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notes      TO authenticated;
GRANT SELECT, INSERT,         DELETE ON TABLE public.note_links TO authenticated;
