import { assertEquals, assertExists } from "@std/assert";
import {
  getIdentifyQuota,
  IDENTIFY_ACTION,
  IDENTIFY_FN,
  IDENTIFY_FREE_LIMIT,
  IDENTIFY_WINDOW_DAYS,
} from "@shared/identifyQuota.ts";

// Tiny in-memory mock of the subset of supabase-js the helper uses.
// Captures the filters applied so the assertions can check them.

interface FakeRow {
  created_at: string;
  user_id: string;
  function_name: string;
  action: string;
}

interface FakeOpts {
  rows: FakeRow[];
  error?: boolean;
}

function buildFakeDb(opts: FakeOpts) {
  return {
    from(table: string) {
      if (table !== "ai_usage_log") throw new Error(`unexpected table: ${table}`);
      let filters: Partial<FakeRow> = {};
      let since: string | null = null;
      let headOnly = false;
      let countMode: string | null = null;
      let orderAsc = false;
      let limitN = Infinity;
      let returnSingle = false;

      const chain = {
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) headOnly = true;
          if (options?.count) countMode = options.count;
          return chain;
        },
        eq(field: keyof FakeRow, value: string) {
          filters[field] = value as any;
          return chain;
        },
        gte(field: "created_at", value: string) {
          if (field === "created_at") since = value;
          return chain;
        },
        order(_field: string, opts: { ascending: boolean }) {
          orderAsc = opts.ascending;
          return chain;
        },
        limit(n: number) {
          limitN = n;
          return chain;
        },
        maybeSingle() {
          returnSingle = true;
          return chain.then(undefined as any);
        },
        then(resolve: any) {
          if (opts.error) {
            return Promise.resolve({ data: null, error: new Error("db"), count: null }).then(resolve);
          }
          let matched = opts.rows.filter((r) =>
            (filters.user_id === undefined || r.user_id === filters.user_id) &&
            (filters.function_name === undefined || r.function_name === filters.function_name) &&
            (filters.action === undefined || r.action === filters.action) &&
            (since === null || r.created_at >= since)
          );
          if (orderAsc) {
            matched.sort((a, b) => a.created_at.localeCompare(b.created_at));
          }
          if (Number.isFinite(limitN)) matched = matched.slice(0, limitN);

          if (returnSingle) {
            return Promise.resolve({ data: matched[0] ?? null, error: null, count: null }).then(resolve);
          }
          if (headOnly && countMode === "exact") {
            return Promise.resolve({ data: null, count: matched.length, error: null }).then(resolve);
          }
          return Promise.resolve({ data: matched, count: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  } as any;
}

const USER = "user-alpha";

function row(daysAgo: number): FakeRow {
  const t = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { created_at: t, user_id: USER, function_name: IDENTIFY_FN, action: IDENTIFY_ACTION };
}

Deno.test("getIdentifyQuota — fresh user, no rows → full limit available", async () => {
  const db = buildFakeDb({ rows: [] });
  const q = await getIdentifyQuota(db, USER);
  assertEquals(q.used, 0);
  assertEquals(q.limit, IDENTIFY_FREE_LIMIT);
  assertEquals(q.remaining, IDENTIFY_FREE_LIMIT);
  assertEquals(q.resetsAt, null);
});

Deno.test("getIdentifyQuota — partial use → remaining = limit - used", async () => {
  const db = buildFakeDb({ rows: [row(0), row(1), row(3)] });
  const q = await getIdentifyQuota(db, USER);
  assertEquals(q.used, 3);
  assertEquals(q.remaining, IDENTIFY_FREE_LIMIT - 3);
  assertEquals(q.resetsAt, null);
});

Deno.test("getIdentifyQuota — exactly at limit → remaining = 0, resetsAt populated", async () => {
  const rows = Array.from({ length: IDENTIFY_FREE_LIMIT }, (_, i) => row(i));
  const db = buildFakeDb({ rows });
  const q = await getIdentifyQuota(db, USER);
  assertEquals(q.used, IDENTIFY_FREE_LIMIT);
  assertEquals(q.remaining, 0);
  assertExists(q.resetsAt);
  // resetsAt should land roughly IDENTIFY_WINDOW_DAYS days after the
  // oldest in-window call (which we made `IDENTIFY_FREE_LIMIT - 1` days ago).
  const oldestAgoDays = IDENTIFY_FREE_LIMIT - 1;
  const expectedResetAgoMs = (IDENTIFY_WINDOW_DAYS - oldestAgoDays) * 24 * 60 * 60 * 1000;
  const resetTime = new Date(q.resetsAt!).getTime();
  const expectedTime = Date.now() + expectedResetAgoMs;
  // Allow 5 minutes of slack for clock drift / runtime nondeterminism.
  const slack = 5 * 60 * 1000;
  if (Math.abs(resetTime - expectedTime) > slack) {
    throw new Error(`resetsAt drift too large: got ${q.resetsAt}, expected ~${new Date(expectedTime).toISOString()}`);
  }
});

Deno.test("getIdentifyQuota — only counts in-window rows", async () => {
  const db = buildFakeDb({
    rows: [
      row(0),
      row(2),
      row(IDENTIFY_WINDOW_DAYS + 1), // outside window — must not count
      row(IDENTIFY_WINDOW_DAYS + 5), // outside window — must not count
    ],
  });
  const q = await getIdentifyQuota(db, USER);
  assertEquals(q.used, 2);
  assertEquals(q.remaining, IDENTIFY_FREE_LIMIT - 2);
});

Deno.test("getIdentifyQuota — DB error fails open (returns full quota)", async () => {
  const db = buildFakeDb({ rows: [], error: true });
  const q = await getIdentifyQuota(db, USER);
  assertEquals(q.used, 0);
  assertEquals(q.remaining, IDENTIFY_FREE_LIMIT);
});
