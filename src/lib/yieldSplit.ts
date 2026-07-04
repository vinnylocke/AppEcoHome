// ─── Yield split (RHO-21) ──────────────────────────────────────────────────
//
// A partial-harvest ("Picked some") entry records the TOTAL amount picked for
// a task. When that task is linked to more than one plant instance we still
// keep the one-row-per-instance data model (so per-instance history and the
// distinct-instances-harvested stat stay meaningful), but the entered total is
// split *evenly* across the instances so downstream sums equal the total the
// user typed — not total × instanceCount (the RHO-21 bug).
//
// `yield_records.value` is `numeric(10,3)` with a `CHECK (value > 0)`, so every
// returned part is rounded to 3dp and the rounding remainder is placed on the
// LAST part, guaranteeing the parts sum EXACTLY to `total`.

/**
 * Split `total` into `n` non-negative parts that sum exactly to `total`,
 * each rounded to 3 decimal places (matching `numeric(10,3)`).
 *
 * The remainder from rounding is added to the last part so `Σ parts === total`.
 * Returns an empty array for a non-positive `n` or a non-finite / non-positive
 * `total`. Callers should skip any part that is `0` (the `value > 0` CHECK) —
 * this only happens in the pathological case where `total` is smaller than the
 * 0.001 granularity can spread across every instance.
 */
export function splitYieldEvenly(total: number, n: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  if (!Number.isInteger(n) || n <= 0) return [];

  // Work in integer thousandths to avoid binary floating-point drift.
  const totalThousandths = Math.round(total * 1000);
  const base = Math.floor(totalThousandths / n);
  const remainder = totalThousandths - base * n; // 0 <= remainder < n

  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    const thousandths = i === n - 1 ? base + remainder : base;
    parts.push(thousandths / 1000);
  }
  return parts;
}
