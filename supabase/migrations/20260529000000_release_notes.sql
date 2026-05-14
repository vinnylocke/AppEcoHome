CREATE TABLE public.release_notes (
  version     text        PRIMARY KEY,
  major       int         NOT NULL,
  minor       int         NOT NULL,
  sections    jsonb       NOT NULL DEFAULT '[]',
  released_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read release_notes"
  ON public.release_notes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed the initial version row (no sections — first ever deploy had no notes system)
INSERT INTO public.release_notes (version, major, minor, sections)
VALUES ('01.0001', 1, 1, '[]'::jsonb)
ON CONFLICT (version) DO NOTHING;
