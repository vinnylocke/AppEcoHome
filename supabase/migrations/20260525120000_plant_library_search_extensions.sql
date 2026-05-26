-- Plant Library Search Lab — supporting extensions, indexes, RPC functions.
--
-- Powers the "Relevance" and "Fuzzy" search methods in the admin
-- Plant Library Search Lab. Both rely on pg_trgm:
--   • Relevance:  exact → prefix → contains, with similarity() as
--                 the tiebreak inside each tier.
--   • Fuzzy:      similarity()-ranked typo-tolerant search.
--
-- Both functions use a window-function COUNT(*) OVER () so the client
-- can paginate without a second round-trip for the total.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on the generated search_text column. Postgres
-- planner uses this for both ILIKE and similarity() lookups, keeping
-- search latency low even on 40k+ rows.
CREATE INDEX IF NOT EXISTS plant_library_search_text_trgm_idx
  ON plant_library
  USING GIN (search_text gin_trgm_ops);

-- ---------------------------------------------------------------
-- RPC: search_plant_library_relevance
-- ---------------------------------------------------------------
-- Ordering (lowest rank value wins):
--   0 = exact match on common_name (case-insensitive)
--   1 = common_name starts with query
--   2 = search_text contains query
--   3 = no contains match — only included if pg_trgm similarity
--       above the floor (defensive — generally won't appear)
-- Tiebreak inside a tier: trigram similarity DESC, then common_name ASC.
-- Returns one extra column `total_count` so the client can paginate.

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
AS $$
  WITH q AS (
    SELECT lower(trim(p_query)) AS qtext
  ),
  scored AS (
    SELECT
      pl,
      CASE
        WHEN lower(pl.common_name) = q.qtext                              THEN 0
        WHEN lower(pl.common_name) LIKE q.qtext || '%'                    THEN 1
        WHEN pl.search_text LIKE '%' || q.qtext || '%'                    THEN 2
        ELSE                                                                   3
      END AS rank,
      similarity(pl.search_text, q.qtext) AS similarity_score
    FROM plant_library pl
    CROSS JOIN q
    WHERE
      -- Quick prefilter — anything that doesn't contain the query as
      -- a substring AND doesn't trigram-match is excluded entirely.
      -- The GIN index handles both branches efficiently.
      pl.search_text LIKE '%' || q.qtext || '%'
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
$$;

-- ---------------------------------------------------------------
-- RPC: search_plant_library_fuzzy
-- ---------------------------------------------------------------
-- Trigram similarity ranking only. Useful when you can't remember
-- the exact spelling. Returns rows ordered by similarity DESC.
-- p_min_similarity is the floor — values < this are excluded.
-- The pg_trgm default `similarity_threshold` is 0.3 but we expose
-- a lower default (0.1) so partial-word matches still surface.

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
AS $$
  WITH q AS (
    SELECT lower(trim(p_query)) AS qtext
  ),
  scored AS (
    SELECT
      pl,
      similarity(pl.search_text, q.qtext) AS similarity_score
    FROM plant_library pl
    CROSS JOIN q
    WHERE
      similarity(pl.search_text, q.qtext) >= p_min_similarity
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
$$;

-- Grant execute to authenticated (RLS on plant_library still applies
-- via SECURITY INVOKER — admin-only access is enforced there).
GRANT EXECUTE ON FUNCTION public.search_plant_library_relevance(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_plant_library_fuzzy(TEXT, INT, INT, REAL) TO authenticated;
