-- Add 'library' as a valid ailment source.
--
-- Library-added ailments (from the seeded ailment_library, the free default
-- search source for every tier) were previously stored as source='ai',
-- indistinguishable from genuine Rhozly-AI ailments. On a no-AI tier that's
-- misleading. `library` makes them a first-class, distinctly-labelled source —
-- mirroring how plants treat their Library source.
--
-- Additive + safe: existing rows are unaffected; no historical backfill (old
-- 'ai' rows that were really library adds can't be told apart from genuine AI
-- rows, and mislabelling real AI rows would be worse). New library adds use
-- 'library' (see ailmentLibraryService.ts).

ALTER TABLE public.ailments DROP CONSTRAINT IF EXISTS ailments_source_check;
ALTER TABLE public.ailments ADD CONSTRAINT ailments_source_check
  CHECK (source IN ('manual', 'perenual', 'ai', 'library'));
