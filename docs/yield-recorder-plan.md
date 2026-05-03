# Yield Recorder + Yield Predictor — Implementation Plan

## Overview

Two-stage feature added to the plant instance modal (`InstanceEditModal`):

- **Stage 1 — Yield Recorder** (all users): log harvests with value, unit, notes; auto-writes to Plant Journal.
- **Stage 2 — Yield Predictor** (AI tier only): AI-powered yield estimate using weather, planted date, past harvests, and expected harvest date.

---

## 1. Database Changes

### Migration: `supabase/migrations/20260504000000_yield_recorder.sql`

```sql
-- 1. New table: yield_records
CREATE TABLE IF NOT EXISTS public.yield_records (
  id            uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id       uuid          NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  instance_id   uuid          NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  value         numeric(10,3) NOT NULL CHECK (value > 0),
  unit          text          NOT NULL,
  notes         text,
  harvested_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.yield_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_members_can_select_yield_records"
  ON public.yield_records FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_insert_yield_records"
  ON public.yield_records FOR INSERT TO authenticated
  WITH CHECK (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_update_yield_records"
  ON public.yield_records FOR UPDATE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "home_members_can_delete_yield_records"
  ON public.yield_records FOR DELETE TO authenticated
  USING (home_id IN (
    SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_yield_records_instance_id
  ON public.yield_records (instance_id, harvested_at DESC);
CREATE INDEX idx_yield_records_home_id
  ON public.yield_records (home_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yield_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yield_records TO service_role;

-- 2. New column on inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS expected_harvest_date date;
```

---

## 2. Architecture Decisions

### State management
`YieldTab.tsx` owns all local state (form fields, history, prediction result, loading flags). Fully self-contained — no global state changes.

### AI gate — dual-layer
1. **UI layer** — `YieldTab` receives `aiEnabled: boolean` from `InstanceEditModal`. When `false`, a paywall banner replaces the predictor section.
2. **Edge Function layer** — `predict-yield` re-checks `user_profiles.ai_enabled` via service role. Returns 403 if false.

### `InstanceEditModal` prop threading
New optional `aiEnabled?: boolean` prop. Call sites thread `profile?.ai_enabled ?? false`. Find all call sites with `grep -rn "InstanceEditModal" src/`.

### Journal side-write
On yield insert: sequential Supabase calls (yield first, then journal). Best-effort — if journal write fails, yield record is preserved. Matches existing pattern.

### Data flow for predictor
```
YieldTab → POST /functions/v1/predict-yield { instance_id, home_id }
  → verify ai_enabled (service role)
  → fetch inventory_item + plant species + yield_records + weather_snapshot
  → buildYieldPrompt() → Gemini → { estimated_value, unit, confidence, reasoning, tips[] }
← PredictionResult rendered in YieldPredictionCard
```

---

## 3. Files to Create

| File | Purpose |
|------|---------|
| `src/components/YieldTab.tsx` | Yield tab: form, history, predictor section |
| `src/components/YieldPredictionCard.tsx` | Presentational card for AI prediction result |
| `src/services/yieldService.ts` | Supabase calls: fetch/insert/delete yield records, update expected_harvest_date |
| `supabase/functions/predict-yield/index.ts` | Deno Edge Function: fetch context, build prompt, call Gemini |
| `supabase/functions/predict-yield/deno.json` | Deno import map (copy from another function) |
| `supabase/functions/_shared/yieldPrompt.ts` | `buildYieldPrompt()` helper — extracted for testability |
| `supabase/migrations/20260504000000_yield_recorder.sql` | DB migration |
| `supabase/seeds/10_yield.sql` | E2E seed data |
| `tests/unit/lib/yieldService.test.ts` | 10 Vitest unit tests |
| `supabase/tests/yield/predictYield.test.ts` | 6 Deno tests for prompt builder |
| `tests/e2e/specs/yield.spec.ts` | 20 Playwright E2E tests (Section 16) |
| `tests/e2e/pages/YieldPage.ts` | Page Object Model for Yield tab |

---

## 4. Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `YieldRecord`, `NewYieldRecord`, `YieldPrediction` interfaces |
| `src/components/InstanceEditModal.tsx` | Add `aiEnabled?` prop, `Wheat` icon, Yield tab button + panel |
| `src/components/LocationPage.tsx` (+ any other InstanceEditModal call sites) | Thread `aiEnabled={profile?.ai_enabled ?? false}` |
| `tests/unit/fixtures/plants.ts` | Add `makeYieldRecord()` and `makeYieldPrediction()` factories |
| `tests/e2e/fixtures/api-mocks.ts` | Add `MOCK_PREDICT_YIELD` canned response |
| `TESTING.md` | Update unit/E2E test inventory with new counts |
| `docs/e2e-test-plan.md` | Add Section 16 — Yield (YLD-001–020) |

---

## 5. Implementation Order

1. **Migration** — write and apply `20260504000000_yield_recorder.sql` locally
2. **Types** — add `YieldRecord`, `NewYieldRecord`, `YieldPrediction` to `src/types.ts`
3. **`yieldService.ts`** — four service functions; write unit tests in parallel
4. **`YieldPredictionCard.tsx`** — pure presentational component
5. **`YieldTab.tsx` Stage 1** — form + history list; predictor section stubbed as paywall/placeholder
6. **Wire `InstanceEditModal`** — add tab, thread `aiEnabled` prop through call sites
7. **Seed `10_yield.sql`** — apply with `npm run test:seed`
8. **E2E Stage 1** — `YieldPage.ts` POM + YLD-001–010
9. **`predict-yield` Edge Function** — Deno function + `_shared/yieldPrompt.ts`
10. **`YieldTab.tsx` Stage 2** — expected harvest date, Predict Yield button, `YieldPredictionCard`
11. **Deno tests** — `predictYield.test.ts`
12. **E2E Stage 2** — YLD-011–020 + mock wiring
13. **Docs update** — TESTING.md + e2e-test-plan.md
14. **Full regression** — `npm run test:all`

---

## 6. New TypeScript Types

```typescript
// src/types.ts additions

export interface YieldRecord {
  id: string;
  home_id: string;
  instance_id: string;
  value: number;
  unit: string;
  notes: string | null;
  harvested_at: string;
}

export interface NewYieldRecord {
  home_id: string;
  instance_id: string;
  value: number;
  unit: string;
  notes?: string | null;
}

export interface YieldPrediction {
  estimated_value: number;
  unit: string;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  tips: string[];
}
```

---

## 7. `YieldTab.tsx` Component Shape

```typescript
interface YieldTabProps {
  instanceId: string;
  homeId: string;
  plantedAt: string | null;
  aiEnabled: boolean;
  instance: any;
}

// State
const [form, setForm] = useState({ value: '', unit: 'kg', customUnit: '', notes: '' });
const [records, setRecords] = useState<YieldRecord[]>([]);
const [loadingRecords, setLoadingRecords] = useState(true);
const [submitting, setSubmitting] = useState(false);
const [expectedHarvestDate, setExpectedHarvestDate] = useState<string>(
  instance.expected_harvest_date ?? ''
);
const [savingHarvestDate, setSavingHarvestDate] = useState(false);
const [predicting, setPredicting] = useState(false);
const [prediction, setPrediction] = useState<YieldPrediction | null>(null);
```

Unit options: `"g"`, `"kg"`, `"lbs"`, `"oz"`, `"items"`, `"bunches"` — plus an "Other…" option that reveals a free-text input.

---

## 8. `predict-yield` Edge Function

Request: `POST { instance_id: string, home_id: string }`

Response: `{ estimated_value: number, unit: string, confidence: "low"|"medium"|"high", reasoning: string, tips: string[] }`

Server-side fetches:
1. `user_profiles` — verify `ai_enabled = true`
2. `inventory_items` — `planted_at`, `expected_harvest_date`, `nickname`, `plant_id`
3. `plants` — `common_name`, `cycle`, `watering`, `care_level`, `sunlight`
4. `yield_records` — last 20 harvests for this instance
5. `weather_snapshots` — latest snapshot for `home_id`

Prompt builder: `buildYieldPrompt()` extracted to `supabase/functions/_shared/yieldPrompt.ts`.

---

## 9. Test Plan

### Unit tests — `tests/unit/lib/yieldService.test.ts` (10 tests)

| ID | Description |
|----|-------------|
| `YLD-UNIT-001` | `validateYieldValue(0)` returns error message |
| `YLD-UNIT-002` | `validateYieldValue(-1)` returns error message |
| `YLD-UNIT-003` | `validateYieldValue(1.5)` returns null |
| `YLD-UNIT-004` | `insertYieldRecord` calls `yield_records.insert` with correct payload |
| `YLD-UNIT-005` | `insertYieldRecord` also writes `plant_journals` with `entry_type = "yield_logged"` |
| `YLD-UNIT-006` | `fetchYieldRecords` orders by `harvested_at DESC` |
| `YLD-UNIT-007` | `fetchYieldRecords` filters by `instance_id` |
| `YLD-UNIT-008` | `deleteYieldRecord` calls `.delete().eq("id", ...)` |
| `YLD-UNIT-009` | `updateExpectedHarvestDate` with a date calls `.update({ expected_harvest_date })` |
| `YLD-UNIT-010` | `updateExpectedHarvestDate` with null passes null |

### Deno tests — `supabase/tests/yield/predictYield.test.ts` (6 tests)

| ID | Description |
|----|-------------|
| `YLD-FN-001` | `buildYieldPrompt` includes plant `common_name` |
| `YLD-FN-002` | `buildYieldPrompt` includes `planted_date` when present |
| `YLD-FN-003` | `buildYieldPrompt` includes `expected_harvest_date` when present |
| `YLD-FN-004` | `buildYieldPrompt` with zero records produces "no harvest history" text |
| `YLD-FN-005` | `buildYieldPrompt` with 3 records lists them |
| `YLD-FN-006` | `buildYieldPrompt` includes weather summary when snapshot provided |

### E2E tests — `tests/e2e/specs/yield.spec.ts` (20 tests, Section 16)

#### Stage 1 — Recorder

| ID | Description |
|----|-------------|
| `YLD-001` | Yield tab is visible when opening an instance modal |
| `YLD-002` | Unit select contains all 6 options |
| `YLD-003` | Submitting value=0.5 unit=kg inserts record and shows it in history |
| `YLD-004` | Second entry appears at top of history (newest first) |
| `YLD-005` | Submitting empty value shows validation error |
| `YLD-006` | Submitting without notes succeeds |
| `YLD-007` | Seeded yield records are visible on tab open |
| `YLD-008` | Deleting a record removes it from the history list |
| `YLD-009` | History shows human-readable date (e.g. "May 1, 2026") |
| `YLD-010` | After logging, Plant Journal tab shows a `yield_logged` entry |

#### Stage 2 — Predictor

| ID | Description |
|----|-------------|
| `YLD-011` | Free user (`ai_enabled=false`) sees paywall banner not Predict button |
| `YLD-012` | AI user sees expected harvest date input and Predict Yield button |
| `YLD-013` | Setting expected harvest date persists on modal re-open |
| `YLD-014` | Clicking Predict Yield shows loading state |
| `YLD-015` | Mocked prediction renders "2.4 kg" in the prediction card |
| `YLD-016` | Confidence badge reads "Medium" for `confidence: "medium"` |
| `YLD-017` | Reasoning paragraph text is visible |
| `YLD-018` | Each tip is rendered as a list item |
| `YLD-019` | Clicking Predict Yield again replaces the previous card |
| `YLD-020` | Edge Function 400 error shows toast, no prediction card |

---

## 10. Seed Data — `supabase/seeds/10_yield.sql`

Three past harvests on Basil instance (BAS-001, `inventory_items` id `00000000-0000-0000-0004-000000000002`).
UUID segment `0016` reserved for yield records.
Cross-home isolation marker included for `data-isolation.spec.ts`.

---

## Notes

- **AI gate** uses existing `ai_enabled boolean` on `user_profiles` — consistent with PlantDoctor. Not a new `subscription_tier` field.
- **YLD-011** (free user test): use Supabase service role in `beforeEach` to temporarily set `ai_enabled = false`, restore in `afterEach`.
- **Guides table** has no RLS (public); `yield_records` has full home-scoped RLS.
- The `buildYieldPrompt` shared helper keeps the Edge Function thin and the Deno tests fast.
