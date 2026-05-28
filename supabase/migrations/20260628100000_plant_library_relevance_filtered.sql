-- Unified plant search — filtered relevance RPC.
--
-- Extends search_plant_library_relevance with structured filters driven
-- by a jsonb blob, and supports an empty query (browse-by-filter). Same
-- tiered ranking (exact → prefix → contains → trigram); filters are
-- applied as WHERE clauses on indexed/structured columns.
--
-- Filter keys (all optional):
--   edible     bool   → is_edible
--   indoor     bool   → indoor
--   poisonous  bool   → is_toxic_humans
--   cycle      text[] → cycle matches any (case-insensitive)
--   watering   text[] → watering matches any (case-insensitive)
--   sunlight   text[] → sunlight jsonb array overlaps any (?|)

CREATE OR REPLACE FUNCTION public.search_plant_library_relevance_filtered(
  p_query     TEXT,
  p_page_size INT  DEFAULT 12,
  p_offset    INT  DEFAULT 0,
  p_filters   JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  row_data         plant_library,
  rank             INT,
  similarity_score REAL,
  total_count      BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT lower(trim(coalesce(p_query, ''))) AS qtext
  ),
  filtered AS (
    SELECT pl, q.qtext AS qtext
    FROM plant_library pl
    CROSS JOIN q
    WHERE
      -- Text match — skipped entirely when the query is empty so filters
      -- alone can drive a browse. Otherwise substring OR trigram match.
      (
        q.qtext = ''
        OR pl.search_text LIKE '%' || q.qtext || '%'
        OR pl.search_text % q.qtext
      )
      -- Structured filters (each no-ops when its key is absent).
      AND (NOT (p_filters ? 'edible')    OR pl.is_edible       = (p_filters->>'edible')::boolean)
      AND (NOT (p_filters ? 'indoor')    OR pl.indoor          = (p_filters->>'indoor')::boolean)
      AND (NOT (p_filters ? 'poisonous') OR pl.is_toxic_humans = (p_filters->>'poisonous')::boolean)
      AND (
        NOT (p_filters ? 'cycle')
        OR lower(coalesce(pl.cycle, '')) = ANY (
          SELECT lower(x) FROM jsonb_array_elements_text(p_filters->'cycle') AS x
        )
      )
      AND (
        NOT (p_filters ? 'watering')
        OR lower(coalesce(pl.watering, '')) = ANY (
          SELECT lower(x) FROM jsonb_array_elements_text(p_filters->'watering') AS x
        )
      )
      AND (
        NOT (p_filters ? 'sunlight')
        OR pl.sunlight ?| ARRAY(SELECT jsonb_array_elements_text(p_filters->'sunlight'))
      )
  ),
  scored AS (
    SELECT
      pl,
      CASE
        WHEN qtext = ''                                       THEN 2
        WHEN lower((pl).common_name) = qtext                  THEN 0
        WHEN lower((pl).common_name) LIKE qtext || '%'        THEN 1
        WHEN (pl).search_text LIKE '%' || qtext || '%'        THEN 2
        ELSE                                                       3
      END AS rank,
      CASE WHEN qtext = '' THEN 0 ELSE similarity((pl).search_text, qtext) END AS similarity_score
    FROM filtered
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

GRANT EXECUTE ON FUNCTION public.search_plant_library_relevance_filtered(TEXT, INT, INT, JSONB) TO authenticated;
