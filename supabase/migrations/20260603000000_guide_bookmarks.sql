-- ============================================================
-- GUIDE BOOKMARKS (Phase 2 Wave 5F)
-- Per-user bookmark list of guides. Cross-device because it's
-- stored on the server rather than in localStorage.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.guide_bookmarks (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id    uuid        NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, guide_id)
);

ALTER TABLE public.guide_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_can_read_own_guide_bookmarks"   ON public.guide_bookmarks;
DROP POLICY IF EXISTS "user_can_insert_own_guide_bookmarks" ON public.guide_bookmarks;
DROP POLICY IF EXISTS "user_can_delete_own_guide_bookmarks" ON public.guide_bookmarks;

CREATE POLICY "user_can_read_own_guide_bookmarks"
  ON public.guide_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_can_insert_own_guide_bookmarks"
  ON public.guide_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_can_delete_own_guide_bookmarks"
  ON public.guide_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_guide_bookmarks_user ON public.guide_bookmarks (user_id, created_at DESC);
