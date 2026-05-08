-- Community Guides: user-authored guides with rich text (Tiptap JSON), stars, and comments.

-- Tables
CREATE TABLE public.community_guides (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  subtitle      text,
  body          jsonb       NOT NULL DEFAULT '{}',
  labels        text[]      NOT NULL DEFAULT '{}',
  star_count    integer     NOT NULL DEFAULT 0,
  comment_count integer     NOT NULL DEFAULT 0,
  is_draft      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_guide_stars (
  guide_id   uuid NOT NULL REFERENCES public.community_guides(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, user_id)
);

CREATE TABLE public.community_guide_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id   uuid        NOT NULL REFERENCES public.community_guides(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id  uuid        REFERENCES public.community_guide_comments(id) ON DELETE CASCADE,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX ON public.community_guides USING gin (labels);
CREATE INDEX ON public.community_guides (author_id);
CREATE INDEX ON public.community_guides (created_at DESC);
CREATE INDEX ON public.community_guides (star_count DESC);
CREATE INDEX ON public.community_guide_comments (guide_id, parent_id);

-- updated_at triggers (reuse existing function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.community_guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.community_guide_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Denormalized star_count trigger
CREATE OR REPLACE FUNCTION public.update_guide_star_count()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_guides SET star_count = star_count + 1 WHERE id = NEW.guide_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_guides SET star_count = GREATEST(star_count - 1, 0) WHERE id = OLD.guide_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_guide_star_count
  AFTER INSERT OR DELETE ON public.community_guide_stars
  FOR EACH ROW EXECUTE FUNCTION public.update_guide_star_count();

-- Denormalized comment_count trigger
CREATE OR REPLACE FUNCTION public.update_guide_comment_count()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_guides SET comment_count = comment_count + 1 WHERE id = NEW.guide_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_guides SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.guide_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_guide_comment_count
  AFTER INSERT OR DELETE ON public.community_guide_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_guide_comment_count();

-- RLS: community_guides
ALTER TABLE public.community_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read guides"
  ON public.community_guides FOR SELECT TO authenticated
  USING (is_draft = false OR author_id = auth.uid());

CREATE POLICY "insert guide"
  ON public.community_guides FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "update guide"
  ON public.community_guides FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "delete guide"
  ON public.community_guides FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- RLS: community_guide_stars
ALTER TABLE public.community_guide_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read stars"
  ON public.community_guide_stars FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "insert star"
  ON public.community_guide_stars FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete star"
  ON public.community_guide_stars FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS: community_guide_comments
ALTER TABLE public.community_guide_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read comments"
  ON public.community_guide_comments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "insert comment"
  ON public.community_guide_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "update comment"
  ON public.community_guide_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "delete comment"
  ON public.community_guide_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- Storage bucket for guide images
INSERT INTO storage.buckets (id, name, public)
  VALUES ('community-guides', 'community-guides', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read community guide images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-guides');

CREATE POLICY "author upload community guide image"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-guides' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "author delete community guide image"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-guides' AND (storage.foldername(name))[1] = auth.uid()::text);
