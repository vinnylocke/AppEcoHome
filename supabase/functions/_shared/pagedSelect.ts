// Paged SELECT helper for fleet-wide cron queries.
//
// supabase/config.toml sets PostgREST max_rows = 1000: any un-ranged select
// silently truncates once a table grows past that — rows just vanish, no
// error (bug-audit-2026-07-02 §9.10; symptom: "user #1001 never gets a
// digest"). Cron functions that iterate whole tables must page.
//
// `makeQuery` must return a FRESH builder each call (builders are
// single-use); this helper appends `.range()` per page and walks until a
// short page. Errors throw — callers fail closed rather than proceeding on
// a partial fleet.

// deno-lint-ignore no-explicit-any
export async function fetchAllPages<T = any>(
  // deno-lint-ignore no-explicit-any
  makeQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
