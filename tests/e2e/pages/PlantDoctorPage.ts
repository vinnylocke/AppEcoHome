import type { Page, Locator } from "@playwright/test";

export class PlantDoctorPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly uploadFileButton: Locator;
  readonly uploadDropzone: Locator;
  readonly identifyButton: Locator;
  readonly diagnoseButton: Locator;
  readonly fileInput: Locator;
  readonly clearImageButton: Locator;
  readonly aiResultNotes: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Plant Doctor" });
    this.uploadFileButton = page.getByRole("button", { name: "Upload File" });
    this.uploadDropzone = page.getByText("Upload or take a photo");
    this.identifyButton = page.getByRole("button", { name: "Identify Plant" });
    this.diagnoseButton = page.getByRole("button", { name: "Diagnose Health" });
    // The file input is hidden — interact via setInputFiles()
    this.fileInput = page.locator('input[type="file"]');
    this.clearImageButton = page.getByRole("button").filter({ has: page.locator(".lucide-x") });
    this.aiResultNotes = page.locator("text=/possible|identified|diagnosed/i").first();
  }

  async goto() {
    await this.page.goto("/doctor");
  }

  /** Upload a file by setting it on the hidden file input directly. */
  async uploadFile(path: string) {
    await this.fileInput.setInputFiles(path);
  }
}
