# 16. Light — Sensor + Tab + Stats + Lux History

**Spec files:** `tests/e2e/specs/lightsensor.spec.ts` · `tests/e2e/specs/lighttab.spec.ts` · `tests/e2e/specs/statstab.spec.ts`
**Page Objects:** `tests/e2e/pages/LightSensorPage.ts` · `tests/e2e/pages/LightTabPage.ts` · `tests/e2e/pages/InstanceStatsTabPage.ts`
**Seed dependencies:** `01_locations_areas.sql`, `02_plants_shed.sql`, `09_stats.sql`, `10_lux_readings.sql`
**App-reference:** [05-tools/](../app-reference/05-tools/)

Covers the standalone Light Sensor surface (`/lightsensor`), the in-modal Light tab, the Stats tab on instance modal, and the area lux-reading history.

> **Note:** Actual pixel-analysis scanning tests require camera permission + headed mode. Flag with `test.skip()` in CI.

## Light Sensor (`/lightsensor`)

**Spec file:** `tests/e2e/specs/lightsensor.spec.ts`

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| LUX-001 | ✅ | `/lightsensor` heading | — | ✅ Passing |
| LUX-002 | ✅ | Lux display present (showing 0 / initialising) | — | ✅ Passing |
| LUX-003 | ✅ | At least one light category label visible (Deep Shade / Low Light / Bright Indirect / Partial Sun / Direct Sun) | — | ✅ Passing |
| LUX-004 | ✅ | Start scan button visible | — | ✅ Passing |
| LUX-005 | ✅ | Method toggle — Pixel Analysis selectable | — | ✅ Passing |
| LUX-006 | ✅ | Calibration panel opens | — | ✅ Passing |
| LUX-007 | ❌ | Save disabled — no area selected | — | ✅ Passing |
| LUX-008 | ✅ | Location dropdown has "Outside Garden" | — | ✅ Passing |
| LUX-009 | ✅ | Area dropdown has "Raised Bed A" | — | ✅ Passing |
| LUX-010 | ✅ | Save reading — toast (inserts to `area_lux_readings` + updates denormalised column) | — | ✅ Passing |
| LUX-011 | ✅ | Nav link → `/lightsensor` | — | ✅ Passing |

## Light Tab — Instance modal (`lighttab.spec.ts`)

**Seed:** `02_plants_shed.sql` — Basil has `sunlight: ["Full sun", "Partial shade"]`; Tomato has `sunlight: NULL`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| LGT-001 | ✅ | Light tab visible on instance modal | — | ✅ Passing |
| LGT-002 | ✅ | Optimal range card shown for Basil (has sunlight data) | — | ✅ Passing |
| LGT-003 | ✅ | Get Reading button visible | — | ✅ Passing |
| LGT-004 | ✅ | Get Reading opens sensor overlay | — | ✅ Passing |
| LGT-005 | ✅ | Sensor overlay has lux display | — | ✅ Passing |
| LGT-006 | ✅ | Back closes overlay → Get Reading reappears | — | ✅ Passing |

## Light Tab — TheShed plant modal

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| LGT-007 | ✅ | Light tab visible on plant modal opened from TheShed | — | ✅ Passing |
| LGT-008 | ✅ | No-data card shown for plant with null sunlight (Tomato) | — | ✅ Passing |

## Stats Tab — Instance modal (`statstab.spec.ts`)

**Seed:** `09_stats.sql` — 2 yield records on Basil, 1 completed Pruning task linked to Basil, 1 plant_instance_ailment linking Basil → Aphid.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| STT-001 | ✅ | Stats tab visible on instance modal | — | ✅ Passing |
| STT-002 | ✅ | Plant Info shows planted date for Basil (not "Not recorded") | — | ✅ Passing |
| STT-003 | ✅ | Yield count ≥ 1 (2 seeded records) | — | ✅ Passing |
| STT-004 | ✅ | Pruning count ≥ 1 (1 seeded prune task) | — | ✅ Passing |
| STT-005 | ✅ | Issues — at least 1 ailment row (seeded Aphid link) | — | ✅ Passing |
| STT-006 | ✅ | Task total count element visible | — | ✅ Passing |
| STT-007 | ✅ | Tomato — empty states for yield, pruning, ailments | — | ✅ Passing |

## Area Lux Reading History

**Component:** `AreaLuxReadings.tsx` (rendered inside Area Details modal → Advanced tab)
**Seed:** `10_lux_readings.sql` — 3 sensor readings for Raised Bed A.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| LUX-ADV-001 | 🔲 | Add-reading form renders in area advanced tab | — | 🔲 Planned |
| LUX-ADV-002 | 🔲 | Seeded readings appear in the reading list (count ≥ 3 for Raised Bed A) | — | 🔲 Planned |
| LUX-ADV-003 | 🔲 | Adding a manual reading inserts a row | — | 🔲 Planned |
| LUX-ADV-004 | 🔲 | "Save to area" button visible on light reader when instance has an area | — | 🔲 Planned |
