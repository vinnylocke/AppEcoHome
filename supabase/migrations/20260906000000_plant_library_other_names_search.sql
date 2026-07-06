-- Plant Library search: include other_names + space-insensitive matching.
--
-- Fixes two search complaints:
--   1. Searching a plant by an alternate name (other_names) returned nothing —
--      search_text only covered common_name + scientific_name.
--   2. "crab apple" and "crabapple" were treated as different plants.
--
-- A STORED generated column can't have its expression altered in place, so we
-- drop search_text's index + column and re-add it (the value regenerates), and
-- add a normalised companion column `search_norm` (collapsed to alphanumerics)
-- for spacing/punctuation-insensitive matching. Both feed the search RPCs.

-- 1. Rebuild search_text to also include other_names -------------------------
DROP INDEX IF EXISTS public.plant_library_search_text_trgm_idx;
ALTER TABLE public.plant_library DROP COLUMN IF EXISTS search_text;
ALTER TABLE public.plant_library
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(
      common_name || ' ' ||
      COALESCE(scientific_name::text, '') || ' ' ||
      COALESCE(other_names::text, '')
    )
  ) STORED;
COMMENT ON COLUMN public.plant_library.search_text IS
  'Lowercased common_name + scientific_name + other_names (JSON-stringified). One ILIKE / trigram match spans every name field.';

-- 2. Normalised (space/punctuation-insensitive) companion column -------------
ALTER TABLE public.plant_library DROP COLUMN IF EXISTS search_norm;
ALTER TABLE public.plant_library
  ADD COLUMN search_norm text GENERATED ALWAYS AS (
    regexp_replace(
      lower(
        common_name || ' ' ||
        COALESCE(scientific_name::text, '') || ' ' ||
        COALESCE(other_names::text, '')
      ),
      '[^a-z0-9]+', '', 'g'
    )
  ) STORED;
COMMENT ON COLUMN public.plant_library.search_norm IS
  'search_text collapsed to lowercase alphanumerics so "crab apple" = "crabapple". Powers spacing-insensitive matching in the search RPCs (mirrored in src/lib/plantNames.ts normalizePlantName).';

-- 3. Trigram indexes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS plant_library_search_text_trgm_idx
  ON public.plant_library USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS plant_library_search_norm_trgm_idx
  ON public.plant_library USING GIN (search_norm gin_trgm_ops);

-- 4. Relevance RPC — normalised, other_names-aware ranking -------------------
CREATE OR REPLACE FUNCTION public.search_plant_library_relevance(
  p_query     TEXT,
  p_page_size INT DEFAULT 10,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE(
  row_data    plant_library,
  rank        INT,
  similarity_score REAL,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $body$
  WITH q AS (
    SELECT
      lower(trim(p_query))                                         AS qtext,
      regexp_replace(lower(trim(p_query)), '[^a-z0-9]+', '', 'g')  AS qnorm
  ),
  scored AS (
    SELECT
      pl,
      CASE
        WHEN regexp_replace(lower(pl.common_name), '[^a-z0-9]+', '', 'g') = q.qnorm           THEN 0
        WHEN regexp_replace(lower(pl.common_name), '[^a-z0-9]+', '', 'g') LIKE q.qnorm || '%' THEN 1
        WHEN q.qnorm <> '' AND pl.search_norm LIKE '%' || q.qnorm || '%'                      THEN 2
        ELSE                                                                                       3
      END AS rank,
      GREATEST(
        similarity(pl.search_text, q.qtext),
        similarity(pl.search_norm, q.qnorm)
      ) AS similarity_score
    FROM plant_library pl
    CROSS JOIN q
    WHERE
      (q.qnorm <> '' AND pl.search_norm LIKE '%' || q.qnorm || '%')
      OR pl.search_text % q.qtext
  ),
  ordered AS (
    SELECT
      pl AS row_data,
      rank,
      similarity_score,
      COUNT(*) OVER () AS total_count
    FROM scored
    ORDER BY
      rank ASC,
      similarity_score DESC NULLS LAST,
      (pl).common_name ASC
    LIMIT p_page_size
    OFFSET p_offset
  )
  SELECT row_data, rank, similarity_score, total_count FROM ordered;
$body$;
GRANT EXECUTE ON FUNCTION public.search_plant_library_relevance(TEXT, INT, INT) TO authenticated;

-- 5. Fuzzy RPC — similarity across spaced + normalised text -----------------
CREATE OR REPLACE FUNCTION public.search_plant_library_fuzzy(
  p_query          TEXT,
  p_page_size      INT  DEFAULT 10,
  p_offset         INT  DEFAULT 0,
  p_min_similarity REAL DEFAULT 0.1
)
RETURNS TABLE(
  row_data    plant_library,
  similarity_score REAL,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $body$
  WITH q AS (
    SELECT
      lower(trim(p_query))                                         AS qtext,
      regexp_replace(lower(trim(p_query)), '[^a-z0-9]+', '', 'g')  AS qnorm
  ),
  scored AS (
    SELECT
      pl,
      GREATEST(
        similarity(pl.search_text, q.qtext),
        similarity(pl.search_norm, q.qnorm)
      ) AS similarity_score
    FROM plant_library pl
    CROSS JOIN q
    WHERE
      GREATEST(
        similarity(pl.search_text, q.qtext),
        similarity(pl.search_norm, q.qnorm)
      ) >= p_min_similarity
  ),
  ordered AS (
    SELECT
      pl AS row_data,
      similarity_score,
      COUNT(*) OVER () AS total_count
    FROM scored
    ORDER BY
      similarity_score DESC,
      (pl).common_name ASC
    LIMIT p_page_size
    OFFSET p_offset
  )
  SELECT row_data, similarity_score, total_count FROM ordered;
$body$;
GRANT EXECUTE ON FUNCTION public.search_plant_library_fuzzy(TEXT, INT, INT, REAL) TO authenticated;
