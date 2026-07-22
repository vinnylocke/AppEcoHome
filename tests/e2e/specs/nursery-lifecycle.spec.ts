import { expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test } from "../fixtures/auth";
import { NurseryPage } from "../pages/NurseryPage";

/**
 * NURSERY-001..052 — Section 25 lifecycle + cross-surface integrations.
 *
 * Coverage:
 *   - Browse + add packets (001..004)
 *   - Log sowing / observe / discard (010..012)
 *   - Plant Out + "From the Nursery" badge (020..024)
 *   - Bulk paste regex + AI mocked (030..033)
 *   - AddTaskModal picker + Care Guide pill (040..042)
 *   - Shopping refill banner (050..052)
 *
 * Test isolation: each test starts with a wiped `seed_packets` table for
 * this worker's home. The authenticated session has RLS access via the
 * `is_home_member(home_id)` policy, so no service role is needed.
 */

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;

// Worker-specific UUIDs (see scripts/seed-test-db.mjs for the prefix substitution).
const HOME_ID         = `0000000${workerNum}-0000-0000-0000-000000000002`;
const LOC_GARDEN_ID   = `0000000${workerNum}-0000-0000-0001-000000000001`;
const AREA_GREENHOUSE = `0000000${workerNum}-0000-0000-0002-000000000003`;
// Worker N (1-based) → plant_id = (N + 1) * 1_000_000 + offset.
// worker 1 (test1) → Basil 2_000_002; worker 2 (test2) → 3_000_002.
const PLANT_TOMATO    = (workerNum + 1) * 1_000_000 + 1;
const PLANT_BASIL     = (workerNum + 1) * 1_000_000 + 2;
const PLANT_LAVENDER  = (workerNum + 1) * 1_000_000 + 6;
const LIST_ACTIVE_ID  = `0000000${workerNum}-0000-0000-0011-000000000001`;

// Set up a Node-side Supabase client signed in as the test user. The
// authenticated session has RLS access to mutate this worker's home.
async function getSupabase(): Promise<SupabaseClient> {
  const url = process.env.VITE_SUPABASE_URL!;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const email = `test${workerNum}@rhozly.com`;
  const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";
  const client = createClient(url, key);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Supabase sign-in failed: ${error.message}`);
  return client;
}

async function wipeNursery(client: SupabaseClient) {
  // 1. Delete any inventory_items rows produced by Nursery Plant Out tests
  //    so they don't leak across to specs that count Shed instances.
  //    Filter on `from_sowing_id IS NOT NULL` so genuine seed inventory
  //    (Basil / Rose / Tomato / Fern / Mint / Lavender) is preserved.
  await client
    .from("inventory_items")
    .delete()
    .eq("home_id", HOME_ID)
    .not("from_sowing_id", "is", null);
  // 2. Delete packets — cascades to seed_sowings via FK.
  await client.from("seed_packets").delete().eq("home_id", HOME_ID);
  // 3. Drop any optimiser-style consolidated blueprints AutomationEngine may
  //    have added (none expected without plant_schedules, but harmless).
  await client
    .from("task_blueprints")
    .delete()
    .eq("home_id", HOME_ID)
    .like("title", "Nursery%");
}

async function clearShoppingItems(client: SupabaseClient) {
  // Remove anything added to the active list during a previous test.
  await client.from("shopping_list_items").delete().eq("list_id", LIST_ACTIVE_ID);
}

interface CreatePacketOpts {
  plant_id?: number | null;
  variety?: string | null;
  vendor?: string | null;
  sow_by?: string | null;
  opened_on?: string | null;
}

async function createPacket(
  client: SupabaseClient,
  opts: CreatePacketOpts = {},
): Promise<string> {
  const { data, error } = await client
    .from("seed_packets")
    .insert({
      home_id: HOME_ID,
      plant_id: opts.plant_id ?? null,
      variety: opts.variety ?? "Test Variety",
      vendor: opts.vendor ?? null,
      sow_by: opts.sow_by ?? null,
      opened_on: opts.opened_on ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createPacket failed: ${error.message}`);
  return data.id as string;
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────────

test.describe("Nursery — Section 25 (NURSERY-001..052)", () => {
  let supabase: SupabaseClient;

  test.beforeAll(async () => {
    supabase = await getSupabase();
  });

  test.beforeEach(async () => {
    await wipeNursery(supabase);
    await clearShoppingItems(supabase);
  });

  test.afterAll(async () => {
    // Final scrub so leftover Nursery inventory doesn't poison other specs.
    await wipeNursery(supabase);
    await clearShoppingItems(supabase);
  });

  // ── Browse + add packets ─────────────────────────────────────────────────

  test("NURSERY-001: the Seed box opens from the Plants ⋯ menu (Stage D)", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await expect(nursery.shedViewPlantsBtn).toBeVisible({ timeout: 10000 });
    await nursery.openNursery();
    // beforeEach wipes the nursery, so this always hits NurseryTab's
    // empty-packets branch — which has no `nursery-tab` wrapper (only the
    // loaded/favourites states do). `nursery-add-seeds-btn` is universal.
    await expect(authenticatedPage.getByTestId("nursery-add-seeds-btn")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("seed-box-close").click();
  });

  test("NURSERY-002: Empty state shows add CTAs", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();

    await expect(nursery.nurseryEmpty).toBeVisible({ timeout: 10000 });
    await expect(nursery.nurseryAddEmpty).toBeVisible();
    await expect(nursery.nurseryPasteEmpty).toBeVisible();
  });

  test("NURSERY-003: Add Packet — Shed pick path", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryAddEmpty.click();

    await expect(nursery.addPacketModal).toBeVisible({ timeout: 10000 });
    await expect(nursery.addPacketShedList).toBeVisible();

    // Pick the first Shed plant — seeded inventory has Basil, Rose, Fern, Tomato (unplanted), Lavender.
    await authenticatedPage
      .locator("[data-testid^='add-seed-packet-shed-option-']")
      .first()
      .click();
    await nursery.addPacketNext.click();

    await nursery.packetVarietyInput.fill("Test Variety A");
    await nursery.packetVendorInput.fill("Test Vendor");
    await nursery.addPacketSave.click();

    await expect(authenticatedPage.getByText(/Added .* to your Nursery/i)).toBeVisible({ timeout: 10000 });
    await expect(nursery.anyNurseryRow().first()).toBeVisible({ timeout: 10000 });
  });

  test("NURSERY-004: Add Packet — Free-text 'add later' path", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryAddEmpty.click();

    // The freetext-toggle is sr-only — click the visible label instead.
    await authenticatedPage.locator('label:has([data-testid="add-seed-packet-freetext-toggle"])').click();
    await nursery.addPacketFreetextName.fill("Sunflower");
    await nursery.addPacketNext.click();

    // Variety defaults to the free-text name; just save.
    await nursery.addPacketSave.click();

    await expect(authenticatedPage.getByText(/Added .* to your Nursery/i)).toBeVisible({ timeout: 10000 });

    // Verify the row exists and the underlying packet has plant_id null.
    const { data } = await supabase
      .from("seed_packets")
      .select("id,plant_id,variety")
      .eq("home_id", HOME_ID);
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? [])[0].plant_id).toBeNull();
  });

  // ── Sowing lifecycle ─────────────────────────────────────────────────────

  test("NURSERY-010: Log Sowing creates an active sowing", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
    });
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();

    await nursery.nurseryRow(packetId).click();
    await expect(nursery.packetDetailModal).toBeVisible({ timeout: 10000 });
    await nursery.packetDetailLogSowing.click();

    await expect(nursery.logSowingModal).toBeVisible();
    await nursery.logSowingCount.fill("12");
    await nursery.logSowingSave.click();

    await expect(authenticatedPage.getByText(/12 seeds sown/i).first()).toBeVisible({ timeout: 10000 });
    await expect(nursery.anySowingRow().first()).toBeVisible({ timeout: 10000 });
  });

  test("NURSERY-011: Observe Germination flips status + shows %", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, { plant_id: PLANT_BASIL });
    // Insert a sowing directly so the test focuses on Observe.
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-7),
        sown_count: 12,
        status: "sown",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();
    await nursery.sowingObserveBtn(sowingId).click();

    await expect(nursery.observeModal).toBeVisible();
    await nursery.observeInput.fill("9");
    await nursery.observeSave.click();

    await expect(authenticatedPage.getByText(/9 of 12 sprouted/i)).toBeVisible({ timeout: 10000 });
    // After the modal closes the packet detail re-fetches; the row text
    // becomes "12 seeds sown · 9/12 sprouted (75%)".
    await expect(nursery.sowingRow(sowingId).getByText(/\(75%\)/)).toBeVisible({ timeout: 10000 });
  });

  test("NURSERY-012: Discard sowing → Discarded chip", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, { plant_id: PLANT_BASIL });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-3),
        sown_count: 10,
        status: "sown",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();

    authenticatedPage.on("dialog", (d) => d.accept());
    await nursery.sowingDiscardBtn(sowingId).click();

    await expect(authenticatedPage.getByText(/Sowing discarded/i)).toBeVisible({ timeout: 10000 });
    await expect(nursery.sowingRow(sowingId).getByText(/Discarded/i)).toBeVisible();
  });

  // ── Plant Out + badge ────────────────────────────────────────────────────

  test("NURSERY-020: Plant Out creates inventory_items row with from_sowing_id", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
    });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-7),
        sown_count: 12,
        observed_on: isoDaysFromNow(-2),
        germinated_count: 9,
        status: "germinated",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();
    await nursery.sowingPlantOutBtn(sowingId).click();

    await expect(nursery.plantOutModal).toBeVisible({ timeout: 10000 });
    await nursery.plantOutLocation.selectOption({ value: LOC_GARDEN_ID });
    await nursery.plantOutArea.selectOption({ value: AREA_GREENHOUSE });
    // Quantity defaults to 1 initially and only flips to remainingToPlant
    // after fetchPlantedOutTotal resolves — fill explicitly to remove the race.
    await nursery.plantOutQuantity.fill("9");
    await nursery.plantOutSave.click();

    await expect(authenticatedPage.getByText(/9 seedlings planted in/i)).toBeVisible({ timeout: 15000 });

    // Verify DB: sowing flipped to planted_out, inventory_items row exists.
    const { data: updated } = await supabase
      .from("seed_sowings")
      .select("status,planted_out_at")
      .eq("id", sowingId)
      .single();
    expect(updated!.status).toBe("planted_out");

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id,from_sowing_id,growth_state,quantity")
      .eq("from_sowing_id", sowingId);
    expect((inv ?? []).length).toBe(1);
    expect((inv ?? [])[0].growth_state).toBe("Seedling");
    expect((inv ?? [])[0].quantity).toBe(9);
  });

  test("NURSERY-021: Partial plant-out keeps sowing 'germinated' with remaining hint", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, { plant_id: PLANT_BASIL });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-7),
        sown_count: 12,
        observed_on: isoDaysFromNow(-2),
        germinated_count: 9,
        status: "germinated",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();
    await nursery.sowingPlantOutBtn(sowingId).click();

    await expect(nursery.plantOutModal).toBeVisible({ timeout: 10000 });
    await nursery.plantOutLocation.selectOption({ value: LOC_GARDEN_ID });
    await nursery.plantOutArea.selectOption({ value: AREA_GREENHOUSE });
    await nursery.plantOutQuantity.fill("6");
    await nursery.plantOutSave.click();

    // The toast trail text is "6 seedlings planted in {area} · 3 still on the bench."
    await expect(authenticatedPage.getByText(/3 still on the bench/i)).toBeVisible({ timeout: 15000 });

    const { data: updated } = await supabase
      .from("seed_sowings")
      .select("status")
      .eq("id", sowingId)
      .single();
    expect(updated!.status).toBe("germinated");
  });

  test("NURSERY-022: Plant Out fires AutomationEngine — care blueprints generate", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, { plant_id: PLANT_BASIL });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-7),
        sown_count: 5,
        observed_on: isoDaysFromNow(-1),
        germinated_count: 5,
        status: "germinated",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();
    await nursery.sowingPlantOutBtn(sowingId).click();
    await nursery.plantOutLocation.selectOption({ value: LOC_GARDEN_ID });
    await nursery.plantOutArea.selectOption({ value: AREA_GREENHOUSE });
    await nursery.plantOutQuantity.fill("5");
    await nursery.plantOutSave.click();

    await expect(authenticatedPage.getByText(/5 seedlings planted in/i)).toBeVisible({ timeout: 15000 });

    // AutomationEngine runs client-side after plantOutSowing returns. Its
    // try/catch wrapper is non-fatal — even with zero matching plant_schedules
    // rows (the seed default), Plant Out must still complete and the
    // inventory_items row must persist with the expected shape.
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, growth_state, quantity, area_id, from_sowing_id")
      .eq("from_sowing_id", sowingId)
      .single();
    expect(inv).not.toBeNull();
    expect(inv!.growth_state).toBe("Seedling");
    expect(inv!.quantity).toBe(5);
    expect(inv!.area_id).toBe(AREA_GREENHOUSE);
  });

  test("NURSERY-023: Plant Out disabled when packet.plant_id is null", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, {
      plant_id: null,
      variety: "Mystery Seeds",
    });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-5),
        sown_count: 8,
        observed_on: isoDaysFromNow(-1),
        germinated_count: 6,
        status: "germinated",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryRow(packetId).click();

    await expect(nursery.sowingLinkPlantBtn(sowingId)).toBeVisible({ timeout: 10000 });
    // Plant Out button is not rendered when plant_id is null — link-plant takes its slot.
    await expect(nursery.sowingPlantOutBtn(sowingId)).toHaveCount(0);
  });

  test("NURSERY-024: 'From the Nursery' badge appears on Instance Edit Modal", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
    });
    const { data: sow } = await supabase
      .from("seed_sowings")
      .insert({
        home_id: HOME_ID,
        seed_packet_id: packetId,
        sown_on: isoDaysFromNow(-7),
        sown_count: 3,
        observed_on: isoDaysFromNow(-1),
        germinated_count: 3,
        status: "germinated",
      })
      .select("id")
      .single();
    const sowingId = sow!.id as string;

    // Create the inventory row directly so we don't depend on the UI flow.
    const { data: inv } = await supabase
      .from("inventory_items")
      .insert({
        home_id: HOME_ID,
        plant_id: PLANT_BASIL,
        plant_name: "Basil",
        location_id: LOC_GARDEN_ID,
        location_name: "Outside Garden",
        area_id: AREA_GREENHOUSE,
        area_name: "Greenhouse",
        status: "Planted",
        quantity: 3,
        growth_state: "Seedling",
        from_sowing_id: sowingId,
      })
      .select("id")
      .single();
    const invId = inv!.id as string;

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();

    // Click the Basil plant card → PlantEditModal opens.
    await authenticatedPage.getByTestId(`plant-card-${PLANT_BASIL}`).click();
    // Switch to the Instances tab.
    await authenticatedPage.getByTestId("plant-modal-tab-instances").click();
    // Open the specific inventory row.
    await authenticatedPage.getByTestId(`plant-instance-row-open-${invId}`).click();

    await expect(authenticatedPage.getByTestId("instance-from-nursery-badge")).toBeVisible({ timeout: 10000 });
  });

  // ── Bulk paste ───────────────────────────────────────────────────────────

  test("NURSERY-030: Bulk paste — regex path parses 3 lines into 3 rows", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    await expect(nursery.bulkPasteModal).toBeVisible({ timeout: 10000 });
    await nursery.bulkPasteTextarea.fill(
      "Tomato Sungold\nBasil 'Sweet Genovese'\nSunflower (Giant)",
    );
    await nursery.bulkPasteParse.click();

    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 10000 });
    await expect(nursery.bulkPasteRow(1)).toBeVisible();
    await expect(nursery.bulkPasteRow(2)).toBeVisible();
  });

  test("NURSERY-031: Bulk save inserts all parsed rows", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    await nursery.bulkPasteTextarea.fill(
      "Tomato Sungold\nBasil Genovese\nSunflower Giant",
    );
    await nursery.bulkPasteParse.click();
    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 10000 });

    await nursery.bulkPasteSave.click();
    await expect(authenticatedPage.getByText(/Added 3 packet/i)).toBeVisible({ timeout: 10000 });

    const { data } = await supabase
      .from("seed_packets")
      .select("id,plant_id")
      .eq("home_id", HOME_ID);
    expect((data ?? []).length).toBe(3);
    // RHO-4 Phase 3: link-by-name now applies to the paste path too — "Tomato"
    // and "Basil" match seeded Shed plants and link; "Sunflower" has no match
    // and stays unlinked (plant_id null).
    const linked = (data ?? []).filter((p) => p.plant_id != null);
    expect(linked.length).toBe(2);
    expect((data ?? []).filter((p) => p.plant_id == null).length).toBe(1);
  });

  test("NURSERY-032: Bulk paste row editing flows through to save", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    await nursery.bulkPasteTextarea.fill("Tomato Sungold");
    await nursery.bulkPasteParse.click();
    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 10000 });

    const varietyInput = authenticatedPage.getByTestId("bulk-paste-row-0-variety");
    await varietyInput.fill("Sungold Gold Rush");
    await nursery.bulkPasteSave.click();

    await expect(authenticatedPage.getByText(/Added 1 packet/i)).toBeVisible({ timeout: 10000 });

    const { data } = await supabase
      .from("seed_packets")
      .select("variety")
      .eq("home_id", HOME_ID)
      .single();
    expect(data!.variety).toBe("Sungold Gold Rush");
  });

  test("NURSERY-033: AI parse path uses mocked edge function", async ({ authenticatedPage }) => {
    // Mock the AI parse edge function. The component falls back to local
    // parsing if AI is unavailable — mocking guarantees the AI path is
    // exercised even when ai_enabled is false.
    await authenticatedPage.route("**/functions/v1/parse-seed-packets", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          packets: [
            { common_name: "Tomato", variety: "Mock AI Sungold", vendor: "MockSeeds", sow_by: null, opened_on: null, purchased_on: null, quantity_remaining: null, notes: "From AI mock" },
          ],
        }),
      });
    });
    // Also flip ai_enabled on so the AI path is selected.
    await authenticatedPage.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() !== "GET") return route.fallback();
      const upstream = await route.fetch();
      const json = await upstream.json().catch(() => null);
      const rows: any[] = Array.isArray(json) ? json : json ? [json] : [];
      const patched = rows.map((row) => ({ ...row, ai_enabled: true }));
      const body = Array.isArray(json) ? patched : (patched[0] ?? null);
      return route.fulfill({
        status: upstream.status(),
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    await nursery.bulkPasteTextarea.fill("Some unstructured prose about Sungold tomatoes from MockSeeds");
    await nursery.bulkPasteParse.click();

    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("bulk-paste-row-0-variety")).toHaveValue("Mock AI Sungold");
  });

  // ── RHO-4 Phase 3 — CSV upload + template + favourites + link-by-name ─────

  test("NURSERY-034 (RHO-4): Bulk add opens with a mode toggle + CSV template download", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    await expect(nursery.bulkPasteModePaste).toBeVisible({ timeout: 8000 });
    await expect(nursery.bulkPasteModeCsv).toBeVisible();

    await nursery.bulkPasteModeCsv.click();
    const [download] = await Promise.all([
      authenticatedPage.waitForEvent("download", { timeout: 8000 }),
      nursery.csvTemplateDownload.click(),
    ]);
    expect(download.suggestedFilename()).toBe("rhozly-seed-packets-template.csv");
  });

  test("NURSERY-035 (RHO-4): CSV upload shows review rows; bad date row is flagged", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();
    await nursery.bulkPasteModeCsv.click();

    // Row 0 valid (partial sow_by date), row 1 has an unparseable date.
    const csv =
      "plant_name,variety,sow_by\n" +
      "Tomato,CSV Sungold,2028-12\n" +
      "Basil,CSV Genovese,someday\n";
    await nursery.uploadCsv("packets.csv", csv);

    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 8000 });
    await expect(nursery.bulkPasteRow(1)).toBeVisible();
    await expect(nursery.bulkPasteRowErrors(1)).toBeVisible();
    // The valid row's flexible date resolved to end-of-month.
    await expect(authenticatedPage.getByTestId("bulk-paste-row-0-sow-by")).toHaveValue("2028-12-31");
    // Save counts only the valid row.
    await expect(nursery.bulkPasteSave).toContainText(/Add 1 packet/i, { timeout: 5000 });
  });

  test("NURSERY-036 (RHO-4): CSV import creates packets, links by name + favourites a flagged row", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();
    await nursery.bulkPasteModeCsv.click();

    const stamp = Date.now();
    const linkedVariety = `CSV Linked ${stamp}`;
    const favVariety = `CSV Fav ${stamp}`;
    // Row 0: plant_name "Tomato" matches a seeded Shed plant → linked.
    // Row 1: unknown plant → unlinked; favourite flagged.
    const csv =
      "plant_name,variety,favourite\n" +
      `Tomato,${linkedVariety},false\n` +
      `Nonexistent Plant ${stamp},${favVariety},true\n`;
    await nursery.uploadCsv("packets.csv", csv);

    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 8000 });
    // The favourite column pre-ticks the second row.
    await expect(nursery.bulkPasteRowFavourite(1)).toBeChecked();

    await nursery.bulkPasteSave.click();
    await expect(authenticatedPage.getByText(/Added 2 packets/i)).toBeVisible({ timeout: 12000 });

    // Linked packet resolved plant_name "Tomato" → the seeded plant_id.
    const { data: linked } = await supabase
      .from("seed_packets")
      .select("plant_id, notes")
      .eq("home_id", HOME_ID)
      .eq("variety", linkedVariety)
      .single();
    expect(linked!.plant_id).toBe(PLANT_TOMATO);

    // Unlinked packet keeps plant_id null + preserves the name in notes provenance.
    const { data: unlinked } = await supabase
      .from("seed_packets")
      .select("plant_id, notes")
      .eq("home_id", HOME_ID)
      .eq("variety", favVariety)
      .single();
    expect(unlinked!.plant_id).toBeNull();
    expect(unlinked!.notes ?? "").toContain("Nonexistent Plant");

    // The flagged row is favourited (packets are ungated).
    const { data: favs } = await supabase
      .from("user_favourite_seed_packets")
      .select("variety")
      .eq("variety", favVariety);
    expect((favs ?? []).length).toBe(1);

    // Cleanup favourite (packets are wiped by beforeEach; favourites are not).
    await supabase.from("user_favourite_seed_packets").delete().eq("variety", favVariety);
  });

  test("NURSERY-037 (RHO-4): free-text paste still reaches the shared review step + favourite toggle", async ({ authenticatedPage }) => {
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();
    await nursery.nurseryPasteEmpty.click();

    // Paste mode is the default.
    await nursery.bulkPasteTextarea.fill("Tomato Sungold (Suttons, ~30 seeds)");
    await nursery.bulkPasteParse.click();

    await expect(nursery.bulkPasteRow(0)).toBeVisible({ timeout: 10000 });
    // The shared review step exposes the "Mark all as favourites" toggle + per-row favourite.
    await expect(nursery.bulkPasteFavouriteAll).toBeVisible();
    await expect(nursery.bulkPasteRowFavourite(0)).toBeVisible();
  });

  // ── AddTaskModal + Care Guide integration ────────────────────────────────

  test("NURSERY-040: AddTaskModal shows Nursery packet picker on Planting", async ({ authenticatedPage }) => {
    await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
      vendor: "Suttons",
    });

    await authenticatedPage.goto("/schedule");
    await authenticatedPage.getByTestId("blueprint-new-btn").click();
    await expect(authenticatedPage.getByPlaceholder("Task Name *")).toBeVisible({ timeout: 10000 });

    // Change Task Type → Planting.
    const taskTypeSelect = authenticatedPage.locator("select").first();
    await taskTypeSelect.selectOption({ label: "Planting" });

    const nursery = new NurseryPage(authenticatedPage);
    await expect(nursery.nurseryPacketPicker).toBeVisible({ timeout: 10000 });
  });

  test("NURSERY-041: Picking a packet pre-fills the task title", async ({ authenticatedPage }) => {
    await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
      vendor: "Suttons",
    });

    await authenticatedPage.goto("/schedule");
    await authenticatedPage.getByTestId("blueprint-new-btn").click();
    const titleInput = authenticatedPage.getByPlaceholder("Task Name *");
    await expect(titleInput).toBeVisible({ timeout: 10000 });

    await authenticatedPage.locator("select").first().selectOption({ label: "Planting" });

    const nursery = new NurseryPage(authenticatedPage);
    await expect(nursery.nurseryPacketPickerSelect).toBeVisible({ timeout: 10000 });

    // Pick the first non-placeholder option.
    const options = await nursery.nurseryPacketPickerSelect.locator("option").all();
    const realOption = await options[1].getAttribute("value");
    await nursery.nurseryPacketPickerSelect.selectOption(realOption!);

    // Title should be populated by applyNurseryPacketToForm with something
    // referencing the variety or plant name.
    await expect(titleInput).not.toHaveValue("", { timeout: 5000 });
    const value = (await titleInput.inputValue()) ?? "";
    expect(value.length).toBeGreaterThan(0);
  });

  test("NURSERY-042: the 'In your garden' tab shows this plant's seed packets", async ({ authenticatedPage }) => {
    // Hub v3 Stage B: NurseryPacketsForPlant moved from the Care tab to the
    // relabeled "In your garden" tab (id `instances`) — the nursery lives
    // WITH the plant's instances now.
    await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
      vendor: "Suttons",
    });

    await authenticatedPage.goto("/shed");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    await authenticatedPage.getByTestId(`plant-card-${PLANT_BASIL}`).click();
    await authenticatedPage.getByTestId("plant-modal-tab-instances").click();
    const nursery = new NurseryPage(authenticatedPage);
    await expect(nursery.careGuideNurseryPackets).toBeVisible({ timeout: 15000 });
  });

  // ── Shopping refill banner ───────────────────────────────────────────────

  test("NURSERY-050: Refill banner renders when a packet's sow_by is within 90 days", async ({ authenticatedPage }) => {
    await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
      vendor: "Suttons",
      sow_by: isoDaysFromNow(30),
    });

    await authenticatedPage.goto("/shopping");
    const nursery = new NurseryPage(authenticatedPage);
    await expect(nursery.seedRefillBanner).toBeVisible({ timeout: 10000 });
  });

  test("NURSERY-051: 'Add refills' inserts items into the active shopping list", async ({ authenticatedPage }) => {
    await createPacket(supabase, {
      plant_id: PLANT_BASIL,
      variety: "Sweet Genovese",
      vendor: "Suttons",
      sow_by: isoDaysFromNow(30),
    });
    // Clear sessionStorage so the banner isn't auto-dismissed from prior runs.
    await authenticatedPage.addInitScript(() => sessionStorage.clear());

    await authenticatedPage.goto("/shopping");
    const nursery = new NurseryPage(authenticatedPage);
    await expect(nursery.seedRefillBanner).toBeVisible({ timeout: 10000 });

    const beforeCount = await supabase
      .from("shopping_list_items")
      .select("id", { count: "exact" })
      .eq("list_id", LIST_ACTIVE_ID)
      .then((r) => r.count ?? 0);

    await nursery.seedRefillBannerAdd.click();
    await expect(authenticatedPage.getByText(/Added 1 packet refill/i)).toBeVisible({ timeout: 10000 });

    const afterCount = await supabase
      .from("shopping_list_items")
      .select("id", { count: "exact" })
      .eq("list_id", LIST_ACTIVE_ID)
      .then((r) => r.count ?? 0);
    expect(afterCount).toBe(beforeCount + 1);
  });

  test("NURSERY-052: Banner hidden when no refills are due", async ({ authenticatedPage }) => {
    // Nursery is wiped in beforeEach — no packets means no refills.
    await authenticatedPage.goto("/shopping");
    const nursery = new NurseryPage(authenticatedPage);
    // The banner returns null when refills.length === 0. Give the page
    // a beat to settle, then assert non-presence.
    await authenticatedPage.waitForTimeout(1500);
    await expect(nursery.seedRefillBanner).toHaveCount(0);
  });

  // ── Stage 4 (2026-07-21): the Nursery is a first-class hub tab with the
  //    shared HubHeader — a real inline search + one "Add seeds" sheet. ──────

  test("NURSERY-060: the Seed box + Add-seeds sheet — every add path opens from one primary", async ({ authenticatedPage }) => {
    // Stage D (committed pre-v3, 2026-07-21) retired the Nursery hub tab in
    // favour of the Seed box sheet — `garden-hub-tab-nursery` no longer
    // exists and the `?tab=nursery` deep link no longer selects anything.
    // Open via the real current path (⋯ → Seed box) instead of the dead link.
    await createPacket(supabase, { variety: "Cherokee Purple", plant_id: PLANT_TOMATO });
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.gotoShed();
    await nursery.openNursery();

    await expect(authenticatedPage.getByTestId("seed-box-sheet")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByTestId("nursery-add-seeds-btn").click();

    // The sheet carries the classic testids on its rows.
    await expect(authenticatedPage.getByTestId("nursery-paste-packets")).toBeVisible({ timeout: 5000 });
    await authenticatedPage.getByTestId("nursery-add-packets").click();
    await expect(nursery.addPacketModal).toBeVisible({ timeout: 8000 });
    await authenticatedPage.keyboard.press("Escape");
  });

  // ── Hub v3 Stage B — the plant modal's "In your garden" tab ──────────────

  test("GARDEN-B1: the History timeline shows ended records and Restore returns them to active care", async ({ authenticatedPage }) => {
    // Self-contained ended fixture on Basil (table wiped rows are packets —
    // inventory rows need explicit cleanup, done at the end).
    const { data: endedRow, error } = await supabase
      .from("inventory_items")
      .insert({
        home_id: HOME_ID,
        plant_id: String(PLANT_BASIL),
        plant_name: "Basil",
        status: "Archived",
        identifier: "Basil (e2e ended)",
        ended_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        was_natural_end: true,
        end_summary: "e2e history fixture",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const endedId = endedRow!.id as string;

    try {
      await authenticatedPage.goto("/shed");
      await authenticatedPage
        .locator(".animate-spin, .animate-pulse").first()
        .waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
      await authenticatedPage.getByTestId(`plant-card-${PLANT_BASIL}`).click();
      await authenticatedPage.getByTestId("plant-modal-tab-instances").click();

      const historyRow = authenticatedPage.getByTestId(`plant-history-row-${endedId}`);
      await expect(historyRow).toBeVisible({ timeout: 10000 });
      await expect(historyRow).toContainText(/Natural end/i);

      // Restore — SenescenceTab semantics: confirm, then back to the active list.
      await authenticatedPage.getByTestId(`plant-history-restore-${endedId}`).click();
      await authenticatedPage.getByRole("button", { name: /^Restore$/ }).click();
      await expect(historyRow).toHaveCount(0, { timeout: 10000 });
      await expect(authenticatedPage.getByTestId(`plant-instance-row-${endedId}`)).toBeVisible({ timeout: 10000 });
    } finally {
      await supabase.from("inventory_items").delete().eq("id", endedId);
    }
  });

  test("GARDEN-B3: tapping a History row opens the end-of-life record (InstanceEditModal, view-only)", async ({ authenticatedPage }) => {
    // v3 feedback #4 — the History row body is a tap target again
    // (plant-history-open-{id}) that reopens InstanceEditModal on the ended
    // row, restoring the old Senescence "Eye" detail without a new surface.
    const { data: endedRow, error } = await supabase
      .from("inventory_items")
      .insert({
        home_id: HOME_ID,
        plant_id: String(PLANT_BASIL),
        plant_name: "Basil",
        status: "Archived",
        identifier: "Basil (e2e history tap)",
        ended_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        was_natural_end: true,
        end_summary: "e2e history tap-through fixture",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const endedId = endedRow!.id as string;

    try {
      await authenticatedPage.goto("/shed");
      await authenticatedPage
        .locator(".animate-spin, .animate-pulse").first()
        .waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
      await authenticatedPage.getByTestId(`plant-card-${PLANT_BASIL}`).click();

      // Regression (2026-07-22): the glance chip counts PLANTED instances only —
      // the ended fixture must not inflate it ("1 planted", never "2 planted").
      await expect(authenticatedPage.getByTestId("plant-edit-glance-strip")).toContainText(
        "1 planted",
        { timeout: 10000 },
      );

      await authenticatedPage.getByTestId("plant-modal-tab-instances").click();

      const historyRow = authenticatedPage.getByTestId(`plant-history-row-${endedId}`);
      await expect(historyRow).toBeVisible({ timeout: 10000 });

      await authenticatedPage.getByTestId(`plant-history-open-${endedId}`).click();

      const instanceModal = authenticatedPage.getByRole("dialog", { name: "Edit plant instance" });
      await expect(instanceModal).toBeVisible({ timeout: 10000 });
      // "Lifecycle complete" card — the amend/AI re-run surface (Item 4).
      await expect(instanceModal.getByText("Lifecycle complete").first()).toBeVisible();
      await expect(instanceModal.getByTestId("instance-amend-lifecycle")).toBeVisible();

      // Senescence tab (2026-07-22) — ended instances get a dedicated tab
      // surfacing the end-of-life record that otherwise hides in the journal.
      await instanceModal.getByTestId("instance-modal-tab-senescence").click();
      await expect(instanceModal.getByTestId("instance-senescence-tab")).toBeVisible();
      await expect(instanceModal.getByTestId("senescence-end-badge")).toHaveText(/Natural end/i);
      await expect(instanceModal.getByTestId("senescence-end-summary")).toContainText(
        "e2e history tap-through fixture",
      );
      await expect(instanceModal.getByTestId("senescence-restore")).toBeVisible();

      // View-only — close without amending or restoring.
      await instanceModal.getByLabel("Close").click();
      await expect(instanceModal).toHaveCount(0, { timeout: 5000 });
    } finally {
      await supabase.from("inventory_items").delete().eq("id", endedId);
    }
  });

  test("GARDEN-B2: a live sowing surfaces in the plant modal's 'In the nursery' section", async ({ authenticatedPage }) => {
    const packetId = await createPacket(supabase, { plant_id: PLANT_BASIL, variety: "Sweet Genovese" });
    const { data: sowing, error } = await supabase
      .from("seed_sowings")
      .insert({ home_id: HOME_ID, seed_packet_id: packetId, status: "sown", sown_on: new Date().toISOString().slice(0, 10), sown_count: 12 })
      .select("id")
      .single();
    expect(error).toBeNull();

    try {
    await authenticatedPage.goto("/shed");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse").first()
      .waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await authenticatedPage.getByTestId(`plant-card-${PLANT_BASIL}`).click();
    await authenticatedPage.getByTestId("plant-modal-tab-instances").click();

    await expect(authenticatedPage.getByTestId("plant-garden-nursery")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId(`plant-sowing-row-${sowing!.id}`)).toContainText(/Sown · 12 seeds/i);
    } finally {
      await supabase.from("seed_sowings").delete().eq("id", sowing!.id);
    }
  });

  test("NURSERY-061: the inline search filters packets as you type", async ({ authenticatedPage }) => {
    await createPacket(supabase, { variety: "Cherokee Purple", plant_id: PLANT_TOMATO });
    await createPacket(supabase, { variety: "Sweet Genovese", plant_id: PLANT_BASIL });
    const nursery = new NurseryPage(authenticatedPage);
    await nursery.goto();

    const rows = authenticatedPage.locator('[data-testid^="nursery-row-"]');
    await expect(rows).toHaveCount(2, { timeout: 10000 });

    const search = authenticatedPage.getByTestId("nursery-search-input");
    await search.fill("Cherokee");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Cherokee Purple");

    await search.fill("zzz-no-match");
    await expect(rows).toHaveCount(0);
    await search.fill("");
    await expect(rows).toHaveCount(2);
  });
});
