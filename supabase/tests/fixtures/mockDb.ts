// Minimal chainable mock for the Supabase SupabaseClient used in pattern detectors.
// Each call to db.from(tableName) returns a PromiseLike builder that resolves to
// { data: tables[tableName] ?? [] }, ignoring any filter/select/order methods.
// This is intentional — unit tests exercise business logic, not DB filtering.

export function makeMockDb(tables: Record<string, unknown[]>) {
  const makeChain = (data: unknown[]) => {
    const chain: Record<string, unknown> = {};
    const noop = () => chain;
    chain.select = noop;
    chain.eq = noop;
    chain.in = noop;
    chain.gte = noop;
    chain.lte = noop;
    chain.lt = noop;
    chain.not = noop;
    chain.order = noop;
    chain.delete = noop;
    chain.then = (
      onFulfilled: (v: { data: unknown[] }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data }).then(onFulfilled, onRejected);
    chain.catch = (onRejected: (e: unknown) => unknown) =>
      Promise.resolve({ data }).catch(onRejected);
    return chain;
  };

  return {
    from: (tableName: string) => makeChain(tables[tableName] ?? []),
  };
}
