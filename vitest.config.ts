import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    // JUnit XML alongside the console output — feeds the Allure report + any Jira test app.
    reporters: ["default", ["junit", { outputFile: "test-results/junit/vitest.xml" }]],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**"],
      reporter: ["text", "html"],
    },
  },
});
