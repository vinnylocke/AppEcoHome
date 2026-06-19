import { describe, test, expect } from "vitest";
import { APP_HELP_SECTIONS } from "../../../src/data/appHelp";

// Valid route paths from App.tsx (incl. redirect routes that resolve).
const VALID_ROUTES = new Set([
  "/", "/quick", "/quick/calendar", "/walk", "/dashboard", "/schedule", "/shed",
  "/journal", "/weekly", "/notes", "/credits", "/watchlist", "/shopping", "/tools",
  "/integrations", "/visualiser", "/planner", "/doctor", "/profile", "/gardener",
  "/lightsensor", "/sun-trajectory", "/guides", "/ailment-library", "/help",
  "/management", "/garden-layout", "/home-management", "/audit",
]);

describe("APP_HELP_SECTIONS routes", () => {
  test("every help topic deep-links to a real route", () => {
    for (const s of APP_HELP_SECTIONS) {
      const path = s.route.split("?")[0];
      expect(VALID_ROUTES.has(path), `${s.id} → ${s.route}`).toBe(true);
    }
  });

  test("Account topics open the Gardener Profile (/gardener), not the Garden Quiz", () => {
    for (const id of ["account-name", "account-plan", "account-ai-usage"]) {
      const s = APP_HELP_SECTIONS.find((x) => x.id === id);
      expect(s, `missing help topic ${id}`).toBeTruthy();
      expect(s!.route.split("?")[0]).toBe("/gardener");
    }
  });

  test("Garden Quiz topics open /profile", () => {
    for (const id of ["profile-quiz", "profile-preferences", "profile-swipe"]) {
      expect(APP_HELP_SECTIONS.find((x) => x.id === id)?.route).toBe("/profile");
    }
  });
});
