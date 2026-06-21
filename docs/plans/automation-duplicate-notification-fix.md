# Automation fired twice → duplicate notification

## Problem

An automation that ran today sent **two** notifications.

## Root cause — concurrent-invocation race on the firing edge

`evaluate-automations` is invoked from three paths (`20260807000000_hybrid_automation_engine.sql`):

- **5-min cron** `*/5 * * * *` with `{scope:"time"}` — clock-driven automations.
- **15-min cron** `*/15 * * * *` with `{scope:"all"}` — sweeps **every** active automation.
- **event path** — a `device_readings` INSERT trigger posts `{deviceId}`.

At `:00/:15/:30/:45` the 5-min and 15-min crons run **in the same minute**, and a
time-triggered automation appears in **both** candidate sets. In `processOne`
(`evaluate-automations/index.ts`) the firing sequence is:

```
read condition_was_true (=false, rising edge)
→ shouldFire() = true
→ INSERT automation_runs
→ fanoutActions()  ← inserts the notification
→ UPDATE automations SET condition_was_true=true, last_fired_at=now   ← only NOW
```

Two concurrent invocations both read `condition_was_true=false` **before** either writes it,
so both pass `shouldFire`, both insert a run, and **both call `fanoutActions` → two
notifications**. The same race hits sensor automations (event path + the 15-min sweep, or two
readings in quick succession). The stamp is unconditional and happens *after* the side effects,
so it can't de-dupe concurrent firings.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` (the three automation crons)
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` (`automations`, `automation_runs`, cooldown/run-limit)
- `docs/app-reference/99-cross-cutting/12-notifications.md` (`notifications` rows)
- Code: `evaluate-automations/index.ts`, `_shared/fanoutActions.ts`, `_shared/runLimit.ts`, `_shared/conditionTree.ts` (`shouldFire`)

## Fix — atomic "claim the edge" before firing (optimistic CAS)

Keep `shouldFire` as the *decision*, but make the actual **fire exactly-once** by claiming the
automation row with a conditional UPDATE **before** any side effects. Only the invocation whose
claim updates a row proceeds to insert the run + `fanoutActions`.

In `processOne`, replace the post-fanout stamp (lines ~215-217) with a **pre-fanout claim**:

```ts
// Atomically claim this firing edge. A concurrent invocation that already fired
// will have moved last_fired_at, so our conditional update matches 0 rows and we
// bail without notifying.
let claim = db.from("automations")
  .update({ last_fired_at: now.toISOString(), condition_was_true: true, rate_limited_until: null })
  .eq("id", id);
claim = automation.last_fired_at == null
  ? claim.is("last_fired_at", null)
  : claim.eq("last_fired_at", automation.last_fired_at);   // unchanged since we read it
const { data: claimed } = await claim.select("id");
if (!claimed || claimed.length === 0) return { decision: "raced" };

// …only now: INSERT automation_runs + fanoutActions + update the run row…
```

- The losing invocation does **no** `automation_runs` insert and **no** `fanoutActions`, so
  no second notification / valve / run.
- The run-limit gate (step 4) is also protected: the loser never inserts a run, so the count
  can't be double-incremented.
- Non-fire paths (idle / holding / outside-window / rate-limited) are unchanged.
- Cooldown re-fires still work: when a legitimate later edge fires, `last_fired_at` has
  advanced and the optimistic CAS matches the current value again.

## Risks / edge cases

- **Timestamp equality:** the claim matches on the exact `last_fired_at` we read (or `IS NULL`).
  Optimistic concurrency — correct for the at-most-few concurrent invocations here.
- **Manual "Run now"** (`run-automations`) bypasses conditions and calls `fanoutActions`
  directly — out of scope (intentional, user-initiated, not the cron race).

## Tests

- **Deno:** add a test in `supabase/tests/` using the `mockDb` fixture to simulate two
  concurrent `processOne` runs — the second claim returns 0 rows → assert it returns
  `decision: "raced"` and `fanoutActions` is **not** reached (0 notifications). The existing
  `conditionTree.test.ts` `shouldFire` cases are unaffected.

## Docs

- Note the CAS firing guard in `09-data-model-integrations.md` (automations firing) and/or the
  automations engine reference. No cron-schedule change.
