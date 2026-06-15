# 19. Yield Recorder + Predictor

**Spec file:** `tests/e2e/specs/yield.spec.ts`
**Page Object:** `tests/e2e/pages/YieldPage.ts`
**Seed dependencies:**
- `02_plants_shed.sql` — Basil (BAS-001) planted in Raised Bed A (`instance_id: 0000000N-0000-0000-0004-000000000002`)
- `10_yield.sql` — 3 yield records (0.15 kg, 0.20 kg, 0.18 kg) + `expected_harvest_date = 2026-06-01`

**Navigation pattern:** tests use `/dashboard?locationId=…&areaId=…&instanceId=…` which auto-opens the instance modal via AreaDetails' `instanceId` URL-param effect. UUID prefixes are worker-specific (see [01-seeded-fixtures.md](01-seeded-fixtures.md)).

**AI mock (Stage 2):** `mockEdgeFunction(page, "predict-yield", MOCK_PREDICT_YIELD)` returns `{ estimated_value: 2.4, unit: "kg", confidence: "medium", reasoning: "...", tips: [...] }`.

**App-reference:** [03-garden-hub/](../app-reference/03-garden-hub/)

## Stage 1 — Yield Recorder (all users)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| YLD-001 | ✅ | Yield tab visible (`instance-modal-tab-yield`) | — | ✅ Passing |
| YLD-002 | ✅ | Unit select has g, kg, lbs, oz, items, bunches | — | ✅ Passing |
| YLD-003 | ✅ | Submit value=0.5 unit=kg → record in history | — | ✅ Passing |
| YLD-004 | ✅ | Newest first — second entry appears at top | — | ✅ Passing |
| YLD-005 | ❌ | Empty value → `yield-value-error` visible | — | ✅ Passing |
| YLD-006 | ✅ | Submit without notes succeeds | — | ✅ Passing |
| YLD-007 | ✅ | Seeded records visible on tab open (0.15, 0.2, 0.18 kg) | — | ✅ Passing |
| YLD-008 | ❌ | Delete record removes it from history | — | ✅ Passing |
| YLD-009 | ✅ | History shows human-readable date (seeded 2026-04-01 → "April 2026") | — | ✅ Passing |
| YLD-010 | ✅ | After logging yield, Plant Journal shows yield_logged entry | — | ✅ Passing |

## Stage 2 — Yield Predictor (AI users only)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| YLD-011 | ✅ | AI user sees `yield-predict-button` (not paywall) | — | ✅ Passing |
| YLD-012 | ✅ | `yield-harvest-date-input` visible | — | ✅ Passing |
| YLD-013 | ✅ | Harvest date pre-populated from seed ("2026-06-01") | — | ✅ Passing |
| YLD-014 | ✅ | Predict click → "Predicting" loading text | — | ✅ Passing |
| YLD-015 | ✅ | Mocked prediction → `yield-prediction-value` = "2.4" | `predict-yield` | ✅ Passing |
| YLD-016 | ✅ | Confidence badge — "Medium confidence" | `predict-yield` | ✅ Passing |
| YLD-017 | ✅ | Reasoning text from mock visible | `predict-yield` | ✅ Passing |
| YLD-018 | ✅ | 2 tips rendered as list items | `predict-yield` | ✅ Passing |
| YLD-019 | ✅ | Re-predict replaces previous prediction (1 card, not 2) | `predict-yield` | ✅ Passing |
| YLD-020 | ❌ | Edge function 500 → "Failed to get yield prediction" toast, no card | `predict-yield` 500 | ✅ Passing |
