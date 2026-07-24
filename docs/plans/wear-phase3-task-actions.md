# Wear OS Phase 3 — Task actions (complete / postpone / delete)

**Status:** Approved & building. **3a DEPLOYED** (`mutate-task` live; 20 planner tests + EF-018–022 auth tests; fresh top-tier review = SHIP). **3b built** — Kotlin action UI, awaiting on-device test. **3c** docs synced (this doc + `04-data-model-tasks.md` + edge-functions catalogue).
**Owner:** Wear OS companion build (follows Phase 2 day-view, shipped).
**The first WRITE path from the watch. Mutates real production data — designed conservatively.**

> **Review outcome (fresh code-reviewer, opus/high, 2026-07-24):** verdict **SHIP**. Data-isolation closed on ghost + physical + series-delete paths; ghost payload carries every ownership field; 23505/CAS idempotency holds; series delete can't fire unintentionally; branch matrix matches `taskActions.ts`. Two Low findings fixed (ghost-completion event now logs the resolved UUID; event-insert `.error` now read). **Coverage debt (deferred, not a correctness defect):** the handler-level isolation rejections and the `runOps` executor / `maybeAutoJournal` only have intent-level (pure-planner) tests + the SKIP-guarded EF-021/022 auth cases; a live-DB integration test of the executor + a genuine cross-member *personal*-task block (needs multi-member seed data the suite doesn't have yet) are follow-ups.

---

## 1. Goal

Let the user **complete**, **postpone**, and **delete** tasks from the Pixel Watch, with the
same data-correctness the phone/PWA guarantees — no silently-dropped side-effects, no data leaks,
no destructive surprises. Live sync to phone/PC is already free (see §6).

Product decisions (confirmed with the owner):

| Decision | Choice |
|---|---|
| Completing a **Planting/Harvesting** task on the watch | **Core-complete + "finish on phone" hint** — marks it done (streaks/counts/sync stay correct); a short toast says to log planting/harvest details on the phone. The watch does **not** run the inventory flip / automation spawn / yield sheet. |
| **Postpone** UX on the watch | **Quick presets** — Tomorrow / +3 days / Next week (single occurrence only; no whole-series shift). |
| **Delete** scope | **Single-occurrence dismiss AND series delete**, but series delete is gated behind a distinct, honest hard-confirm screen (the app's current copy is misleading — the watch gets clearer wording). |

---

## 2. App-reference & research consulted

This plan is built on a deep multi-agent trace of the whole task-mutation surface (7 readers + a
completeness critic), then personally verified against the live schema. Sources:

- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` (task lifecycle, ghosts, shared mutation core)
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md` (tasks RLS is membership-only; keys are client-side)
- `docs/app-reference/99-cross-cutting/26-pattern-engine.md` (user_events is the only feed)
- `docs/app-reference/99-cross-cutting/15-realtime.md`, `05-data-model-plans.md`, `11-cron-jobs.md`
- `docs/app-reference/08-modals-and-overlays/02-task-modal.md`
- `docs/wear-os-companion-plan.md` §5–6
- Code: `src/lib/taskActions.ts`, `src/lib/taskMutations.ts` (`buildGhostPayload`), `src/components/TaskList.tsx`
  (delete lives here, **not** in taskActions), `src/events/registry.ts`, `src/services/journalAutoUpdateService.ts`,
  `supabase/functions/generate-tasks/index.ts`, `supabase/functions/get-today-tasks/index.ts`,
  `supabase/functions/_shared/todayTasks.ts`.
- Migrations verified: `20260407104724` (RLS + `unique_blueprint_date` + `ON DELETE CASCADE`),
  `20260509100000` (scope/created_by/assigned_to on tasks **and** task_blueprints),
  `20260430010000` (`tasks_type_check` — **excludes `Feeding`**), `20260503074715` (`tasks` in realtime
  publication), `20260417111420` (status check = Pending/Completed/Skipped only), `20261021000000`
  (recurrence_kind/recurs_until), `20260602000000` (paused_until).

### Load-bearing facts (verified, not assumed)

1. **No DB trigger on `tasks`.** Every side-effect (event logging, auto-journal, planting automation,
   yield) is client-orchestrated. A naive `UPDATE status='Completed'` silently drops all of them —
   exactly the known `offlineQueue` "task-status" gap.
2. **The read payload can't feed a write.** `get-today-tasks` returns 7 columns; a faithful ghost row
   needs ~15 (`buildGhostPayload`). ⇒ the write path must **re-fetch the blueprint** server-side.
3. **`task_blueprints` carries every needed column** (`home_id, title, description, task_type,
   location_id, area_id, plan_id, inventory_item_ids, scope, created_by, assigned_to,
   recurrence_kind, recurs_until, paused_until, end_date`). ✅ so the re-fetch works.
4. **Ghost ≠ DB row.** Ghost ids are `ghost-{blueprint_id}-{YYYY-MM-DD}`; blueprint_id is a UUID with
   4 hyphens — never `split('-')`. The read payload already gives `blueprint_id`, `due_date`,
   `window_end_date`, `is_ghost` as separate fields; use those, never parse the id.
5. **`unique_blueprint_date (blueprint_id, due_date)`** is the idempotency backbone: a ghost INSERT can
   race the phone → catch `23505` → UPDATE the existing slot.
6. **Status vocabulary is `Pending | Completed | Skipped`.** `'Postponed'` is **never written** —
   postpone = a `Skipped` tombstone at the old date + a new `Pending` row at the new date.
7. **`tasks` is in the realtime publication** ⇒ any row write fans out to the phone/PC automatically.
8. **`Feeding` is a live AI-generated task type that violates `tasks_type_check`** ⇒ materializing a
   `Feeding` ghost throws `23514` (which the `23505` fallback won't catch). Must be guarded.

---

## 3. Architecture — a new service-role edge function `mutate-task`

**Chosen:** a single write edge function `supabase/functions/mutate-task/`, sibling to `get-today-tasks`.
**Rejected:** direct supabase-kt writes from Kotlin — the read payload is insufficient (fact 2), the
branch logic is heavy and would drift from `taskActions.ts`, and the mandatory `user_events` emission
would have to be duplicated on-device.

Same shape as `get-today-tasks`: `serviceClient()` (bypasses RLS) → `requireAuth` (JWT) →
`requireHomeMembership` → **re-enforce the scope subset itself** (service role sees everything) →
**verify the target row/blueprint's `home_id` == the authorized home** before mutating (membership
alone doesn't stop pairing home A's membership with a task id from home B).

### 3.1 Pure planner + thin executor (mirrors the `todayTasks.ts` pattern)

- **`supabase/functions/_shared/taskWrite.ts`** — a **pure** module (fully Deno-testable, no DB):
  - `buildGhostPayload(blueprint, dueDate, status, overrides, windowEndDate)` — Deno mirror of
    `src/lib/taskMutations.ts` (carries scope/created_by/assigned_to/plan_id/inventory_item_ids/etc.).
  - `planTaskMutation(input): { ops: Op[]; event: EventSpec | null; hint?: string }` — decides the exact
    DB operations for the (action × ghost/physical-blueprint/standalone) matrix below. Returns intent;
    does **not** touch the DB.
  - `ALLOWED_TASK_TYPES` (the `tasks_type_check` set) + `isMaterializable(type)` guard.
- **`supabase/functions/mutate-task/index.ts`** — thin handler: authz → fetch the real task row (if not
  ghost) or the blueprint (if ghost) → `planTaskMutation(...)` → execute `ops` with the service client,
  baking the `23505 → UPDATE-on-(blueprint_id,due_date)` recovery into the executor for INSERT ops →
  emit the `event` (guarded by state transition, §5) → return `{ ok: true, hint? }`.

### 3.2 Request / response

```jsonc
// POST /functions/v1/mutate-task   (Authorization: Bearer <user JWT>)
{
  "home_id": "…uuid…",
  "action": "complete" | "postpone" | "delete",
  "task": {
    "id": "…uuid… | ghost-…",
    "is_ghost": true,
    "blueprint_id": "…uuid… | null",
    "due_date": "2026-08-04",
    "type": "Watering",
    "status": "Pending",
    "window_end_date": null
  },
  "new_date": "2026-08-05",      // postpone only (YYYY-MM-DD)
  "delete_series": false          // delete only; true = also delete the blueprint (hard, cascade)
}
// → 200 { "ok": true, "hint"?: "Log planting details on your phone" }
// → 400 bad input · 401 unauth · 403 wrong home · 422 { error:"unsupported_type", hint:"Finish on phone" }
```

The watch updates optimistically, calls the function, and on success **refetches the current day**
(cheap; mirrors the app's `fetchTasksAndGhosts(true)`). On error it reverts and toasts.

---

## 4. The verified branch matrix (what `planTaskMutation` emits)

Ghost vs physical is read from `task.is_ghost`; blueprint-linked vs standalone from `task.blueprint_id`.

### COMPLETE
| Case | Ops |
|---|---|
| Standalone real (UUID, no blueprint_id) | `UPDATE tasks SET status='Completed', completed_at=now, completed_by=uid WHERE id AND status<>'Completed'` (keep due_date) |
| Physical blueprint-linked real | same `UPDATE … WHERE id AND status<>'Completed'` |
| Ghost | `INSERT` full `buildGhostPayload(bp,…,'Completed',{completed_at,completed_by})`; on 23505 → `UPDATE … WHERE (blueprint_id,due_date) AND status<>'Completed'` |
- **Event:** `task_completed { task_id, task_type, inventory_item_ids }` — only if a row actually transitioned.
- **Planting/Harvesting:** core-complete only; response carries `hint` (finish on phone). No inventory flip / automation / yield.

### POSTPONE  (single occurrence; `new_date` from a preset)
| Case | Ops |
|---|---|
| Standalone real | `UPDATE tasks SET due_date=new_date WHERE id AND due_date<>new_date` (status stays Pending) |
| Physical blueprint-linked real | `UPDATE original SET status='Skipped' WHERE id` **+** `INSERT` Pending row at `new_date` (tolerate 23505) |
| Ghost | `INSERT` Skipped tombstone at old date **+** `INSERT` Pending row at `new_date` (tolerate 23505 on each) |
- **Event:** `task_postponed { task_id, task_type, delay_days, inventory_item_ids }` where `delay_days = round((new_date - due_date)/86_400_000)` — only if the new Pending slot was actually created / due_date actually moved.
- **Omit** the "shift whole blueprint series" affordance (phone-only).

### DELETE
| Case | Ops |
|---|---|
| Standalone real (no blueprint_id) | `DELETE FROM tasks WHERE id` (hard, permanent) |
| Physical blueprint-linked real | `UPDATE tasks SET status='Skipped' WHERE id` (tombstone — **never** hard-delete, or the ghost engine/cron regenerates it) |
| Ghost | `INSERT` Skipped tombstone (nothing to hard-delete) |
| **`delete_series=true`** (any of the above with a blueprint_id) | `DELETE FROM task_blueprints WHERE id` → **CASCADE** wipes all child tasks incl. history. Gated behind the watch hard-confirm (§7). |
- **Event:** `task_skipped { task_id, task_type }` on dismiss (**fixing** the in-app bug where single-occurrence delete logs nothing while bulk does). Series delete additionally logs `blueprint_deleted` to match `BlueprintManager`.

---

## 5. Side-effects the function MUST replicate

| Effect | Trigger source | v1 handling |
|---|---|---|
| `user_events` row (`task_completed`/`skipped`/`postponed`) | **client** | **Mandatory** — emitted server-side. Sole feed for the pattern engine + streaks/achievements (all derived from `user_events`). |
| Auto-journal (`plant_journals`) | **client** (preference-gated, idempotent on `task_id`) | **Replicate** — small port of `maybeCreateAutoEntry` reading `user_profiles.auto_update_journal_categories`. Cheap; keeps journal parity. |
| Planting automation (inventory→Planted + `applyPlantedAutomations`) | **client** | **Deferred** — "finish on phone" hint. Heavy client logic; out of v1. |
| Harvest yield / end-of-life | **client** (interactive sheets) | **Deferred** — hint. Can't render on a watch. |
| `neglectedPlant` detector | reads `tasks.completed_at` | **Free** — survives, since we set `completed_at`. |
| Realtime fan-out to phone/PC | **Postgres WAL** | **Free** — `tasks` is in the publication. |
| Plan progress | — | **Nothing to do** — completion never advances plan state (verified). Just carry `plan_id`. |

**Idempotency (no new table):** CAS-style guards. Every state-changing op includes a `WHERE … AND
status<>target` / `due_date<>new_date` clause; the event fires only when a row actually transitioned.
A retried complete/postpone/dismiss therefore no-ops and does **not** double-log `user_events`.

---

## 6. Authz & security (service role bypasses RLS)

1. `requireAuth(req)` → caller `userId`.
2. `requireHomeMembership(db, home_id, userId)` → 403 if not a member.
3. **Scope subset** (mirror `get-today-tasks` line 63): only act on rows/blueprints where
   `scope='home' OR created_by=userId OR assigned_to=userId`. The watch never mutates another member's
   personal task.
4. **Home-match guard:** fetch the real task row (or blueprint) and confirm its `home_id == home_id`
   before any write — membership alone doesn't bind the id to the home.
5. **created_by preservation:** a materialized ghost carries `blueprint.created_by` (service role bypasses
   the `tasks_insert` `created_by=auth.uid()` check), so a home routine authored by another member keeps
   correct ownership without an RLS conflict. `completed_by` = the caller's `userId`.
6. **Type guard:** if `task.type ∉ ALLOWED_TASK_TYPES`, return `422 unsupported_type` (covers `Feeding`)
   rather than throwing `23514`.
7. Fine-grained `tasks.edit_own/delete_own` are **client-only in the app today** (RLS is membership-only).
   v1 watch matches the app (membership-gated); documented as a known parity point, not silently changed.

---

## 7. Watch (Kotlin) changes

- **`data/TasksRepository.kt`** — add `complete(task)`, `postpone(task, newDate)`, `delete(task, series)`
  calling `functions.invoke("mutate-task")` with the payload in §3.2 (reuse the `WatchTask` fields already
  in hand — no id parsing).
- **`data/model/…`** — reuse `WatchTask`; add a tiny `MutateResult(ok, hint)`.
- **`presentation/tasks/TasksViewModel.kt`** — `onComplete/onPostpone/onDelete` with **optimistic** update
  → call → on success refetch the current day (+ surface `hint` as a toast) → on error revert + error toast.
- **`presentation/tasks/TaskActionScreen.kt`** (new) — tapping a task (currently a no-op) opens a Wear
  action screen (swipe-to-dismiss): **✓ Complete**, **⏰ Postpone** → preset chips (Tomorrow / +3 days /
  Next week), **🗑 Delete** → confirm. For a recurring task, Delete offers **"Just this one"** vs
  **"Delete whole schedule"**; the latter routes to a **distinct destructive confirm** with honest copy
  ("Deletes every task in this schedule, including history. Can't be undone.").
- No changes to the phone app / `src/` (watch-only). Complies with "never modify app code for tests".

---

## 8. Tests (mandatory)

- **`supabase/tests/taskWrite.test.ts`** (new, mirrors `todayTasks.test.ts`) — exhaustive
  `planTaskMutation` + `buildGhostPayload` cases: complete/postpone/delete × ghost/physical-blueprint/
  standalone; ghost payload carries scope/created_by/assigned_to/plan_id/window_end_date; 23505-fallback
  intent; CAS transition guards (no event on no-op); postpone tombstone+insert & delay_days; delete
  tombstone vs hard-delete vs series-cascade; `Feeding` type guard → unsupported; Planting/Harvest hint.
- **`supabase/tests/edge_function_auth.test.ts`** — add `mutate-task` auth coverage (missing JWT / wrong home).
- Kotlin: no test harness (owner verifies on device, as prior phases).
- **No `docs/e2e-test-plan/` row** (watch-only, no browser surface change) — recorded as a negative finding;
  `08-task-lifecycle.md` already covers the browser equivalents.

## 9. Docs to update (same task)

- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` — add `mutate-task`; fix stale
  "7 Deno tests" on the `get-today-tasks` row (now 19).
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — add the **Delete** branch matrix (currently
  undocumented); note the server/watch write mirror; fix drifts (`'Postponed'` never written; column is
  `type` not `task_type`; `materializeTask` lives in taskMutations/taskActions, not taskEngine).
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md` — record the service-role write path's scope
  self-enforcement + home-match guard.
- `docs/app-reference/99-cross-cutting/26-pattern-engine.md` — note watch-originated task events land in `user_events`.
- `docs/wear-os-companion-plan.md` — tighten §5 write path to the verified branch matrix; mark Phase 3.
- `docs/app-reference/00-INDEX.md` — add a row if a dedicated Wear write-path reference file is created.

## 10. Latent bugs found (flagged, not silently inherited)

1. **`Feeding` type** can be AI-generated but violates `tasks_type_check` → any materialization (phone or
   watch) would `23514`. The watch guards it (422); **recommend a separate app fix** (map `Feeding→Fertilizing`
   at photo-task creation, or re-add to the check). Out of scope here — flag only.
2. **In-app single-occurrence delete logs no event** (bulk does). The watch **fixes** this by firing
   `task_skipped`; the app inconsistency is flagged for a separate fix.
3. **`TaskList.ensurePhysicalTask` omits scope/created_by/assigned_to** (unlike `buildGhostPayload`) — a
   possible ownership-leak on the phone's harvest/dependency paths. The watch copies `buildGhostPayload`,
   not this; flagged for a separate app review.

## 11. Risks & mitigations

- **Ownership leak on materialization** → carry every blueprint column; covered by tests asserting payload parity.
- **`23514` on odd types** → type guard returns a friendly 422 + "finish on phone".
- **Destructive series delete from the wrist** → distinct hard-confirm screen with honest copy; never one-tap.
- **Retry double-writes** → CAS transition guards; events only on real transitions.
- **Deploy** → surgical single-function `supabase functions deploy mutate-task --use-api` (read/write fn,
  no migrations, no maintenance mode), human-gated, after `npm run typecheck` + Deno tests pass.

## 12. Implementation order (after approval)

1. **3a** — `_shared/taskWrite.ts` (planner + payload + guards) + `mutate-task/index.ts` (authz + executor);
   `taskWrite.test.ts` + auth test; `deno check`. → deploy `mutate-task`.
2. **3b** — Kotlin: repository methods + `TaskActionScreen` + ViewModel wiring + optimistic/refetch. You
   Run ▶ and test complete → postpone → delete (single) → delete (series, with confirm) on the watch.
3. **3c** — docs sync (§9) + flag the latent bugs (§10).

Complete/postpone verified first (safe), then single-dismiss, then series-delete last (most destructive).
