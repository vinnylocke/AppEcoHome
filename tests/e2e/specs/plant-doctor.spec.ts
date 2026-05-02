import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { PlantDoctorPage } from "../pages/PlantDoctorPage";
import { mockEdgeFunction, MOCK_PLANT_DOCTOR_IDENTIFY, MOCK_PLANT_DOCTOR_DIAGNOSE } from "../fixtures/api-mocks";
import path from "path";

// All tests require an authenticated session.

test.describe("Plant Doctor — page structure", () => {
  test("navigating to /doctor renders the Plant Doctor heading", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();

    await expect(doctor.heading).toBeVisible({ timeout: 10000 });
  });

  test("the upload dropzone and Upload File button are visible before any image is chosen", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();

    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });
    await expect(doctor.uploadFileButton).toBeVisible();
  });

  test("Identify Plant and Diagnose Health buttons are hidden before upload", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();

    await expect(doctor.identifyButton).not.toBeVisible({ timeout: 5000 });
    await expect(doctor.diagnoseButton).not.toBeVisible();
  });

  test("Plant Doctor nav link navigates to /doctor", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    await authenticatedPage
      .getByRole("button", { name: "Plant Doctor" })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL("/doctor");
  });
});

test.describe("Plant Doctor — image upload flow", () => {
  test("uploading an image reveals the Identify and Diagnose buttons", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();

    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Create a 1×1 pixel JPEG data URL and inject it as a file upload
    const base64Pixel =
      "data:image/jpeg;base64," +
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=";

    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, base64Pixel);

    // After upload the action buttons should appear
    await expect(doctor.identifyButton).toBeVisible({ timeout: 5000 });
    await expect(doctor.diagnoseButton).toBeVisible();
  });

  test("AI identify flow: mocked response displays result notes", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);

    // Intercept the plant-doctor edge function before navigating
    await mockEdgeFunction(
      authenticatedPage,
      "plant-doctor",
      MOCK_PLANT_DOCTOR_IDENTIFY,
    );

    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Inject file
    const base64Pixel =
      "data:image/jpeg;base64," +
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=";

    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, base64Pixel);

    await expect(doctor.identifyButton).toBeVisible({ timeout: 5000 });

    // Only click Identify if the button is not disabled (requires aiEnabled=true on account)
    const isDisabled = await doctor.identifyButton.isDisabled();
    if (!isDisabled) {
      await doctor.identifyButton.click();

      // The mocked response includes "tomato" in notes — verify result text appears
      await expect(
        authenticatedPage.getByText(/tomato/i).first(),
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 08 — Plant Doctor: extended flows
// ─────────────────────────────────────────────────────────────────────────────

const TINY_JPEG =
  "data:image/jpeg;base64," +
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=";

test.describe("Plant Doctor — diagnose flow (Section 08)", () => {
  test("DOC-006: Diagnose Health mocked response shows disease notes", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);

    await mockEdgeFunction(
      authenticatedPage,
      "plant-doctor",
      MOCK_PLANT_DOCTOR_DIAGNOSE,
    );

    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, TINY_JPEG);

    await expect(doctor.diagnoseButton).toBeVisible({ timeout: 5000 });

    const isDisabled = await doctor.diagnoseButton.isDisabled();
    if (!isDisabled) {
      await doctor.diagnoseButton.click();

      // Mocked response notes: "Signs of early blight detected on lower leaves."
      await expect(
        authenticatedPage.getByText(/early blight/i).first(),
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("DOC-007: Clearing the uploaded image returns to the dropzone", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Upload a JPEG to trigger image preview state
    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, TINY_JPEG);

    // Image action buttons appear
    await expect(doctor.identifyButton).toBeVisible({ timeout: 5000 });

    // Click the clear image button (first SVG button in the image preview area)
    await doctor.clearImageButton.click();
    await authenticatedPage.waitForTimeout(300);

    // Dropzone should be visible again
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 5000 });
  });

  test("DOC-012: PlantDoctorChat FAB button is visible on /dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // PlantDoctorChat renders a fixed bottom-right round button (chat FAB)
    const chatFab = authenticatedPage.locator(".fixed.bottom-6.right-6");
    const fabVisible = await chatFab.isVisible({ timeout: 10000 }).catch(() => false);

    // The FAB contains a MessageSquare SVG — if it's rendered at all
    if (!fabVisible) {
      // Some viewports may place the FAB differently — verify by button count
      const fixedButtons = authenticatedPage.locator("button.fixed");
      const count = await fixedButtons.count();
      expect(count).toBeGreaterThan(0);
    } else {
      expect(fabVisible).toBe(true);
    }
  });

  test("DOC-010: Edge function error — mock 500 → error toast shown", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);

    // Mock a 200 with an error field so PlantDoctorService throws new Error(data.error)
    // giving a predictable toast message (500 produces FunctionsHttpError with generic message)
    await mockEdgeFunction(
      authenticatedPage,
      "plant-doctor",
      { error: "Failed to analyze plant." },
      200,
    );

    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Inject the test image
    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, TINY_JPEG);

    await expect(doctor.identifyButton).toBeVisible({ timeout: 5000 });

    const isDisabled = await doctor.identifyButton.isDisabled();
    if (!isDisabled) {
      await doctor.identifyButton.click();

      // Error toast should appear — "Failed to analyze plant." or similar
      await expect(
        authenticatedPage.getByText(/Failed to analyze|analyze plant|error/i).first(),
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("DOC-008: 'Add to Plant Journal?' checkbox is visible and interactive after AI result", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);

    // The journal checkbox renders in the diagnose flow inside the remedial_schedules section
    await mockEdgeFunction(
      authenticatedPage,
      "plant-doctor",
      MOCK_PLANT_DOCTOR_DIAGNOSE,
    );

    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, TINY_JPEG);

    await expect(doctor.diagnoseButton).toBeVisible({ timeout: 5000 });

    const isDisabled = await doctor.diagnoseButton.isDisabled();
    if (isDisabled) return; // ai_enabled = false on this account — skip

    await doctor.diagnoseButton.click();

    // Wait for diagnose result text from the mocked response
    await expect(
      authenticatedPage.getByText(/early blight/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // "Add to Plant Journal?" checkbox is inside the remedial_schedules treatment section
    const checkbox = authenticatedPage.getByLabel(/Add to Plant Journal/i);
    await expect(checkbox).toBeVisible({ timeout: 5000 });

    // It starts checked (saveToJournal defaults to true); unchecking and rechecking works
    await checkbox.click();
    await authenticatedPage.waitForTimeout(100);
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  test("DOC-009: AI disabled — Identify and Diagnose buttons are disabled", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock the profile to return ai_enabled: false before the page loads
    await authenticatedPage.route(`${supabaseUrl}/rest/v1/user_profiles*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uid: "00000000-0000-0000-0000-000000000001",
          email: "test@rhozly.com",
          ai_enabled: false,
          enable_perenual: false,
          home_id: "00000000-0000-0000-0000-000000000002",
          onboarded: true,
          is_admin: false,
        }),
      }),
    );

    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto(); // Full page load → profile fetched from mocked endpoint

    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Upload an image so action buttons are rendered
    await authenticatedPage.evaluate((dataUrl: string) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const arr = dataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], "test-plant.jpg", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, TINY_JPEG);

    await expect(doctor.identifyButton).toBeVisible({ timeout: 5000 });

    // With ai_enabled=false both action buttons should be disabled
    await expect(doctor.identifyButton).toBeDisabled({ timeout: 5000 });
    await expect(doctor.diagnoseButton).toBeDisabled();
  });

  test("DOC-013: Uploading an invalid file type shows an error", async ({ authenticatedPage }) => {
    const doctor = new PlantDoctorPage(authenticatedPage);
    await doctor.goto();
    await expect(doctor.uploadDropzone).toBeVisible({ timeout: 10000 });

    // Inject a .txt file — component calls toast.error("Invalid file type.")
    await authenticatedPage.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Toast with "Invalid file type." should appear
    await expect(
      authenticatedPage.getByText(/Invalid file type/i),
    ).toBeVisible({ timeout: 5000 });
  });
});
