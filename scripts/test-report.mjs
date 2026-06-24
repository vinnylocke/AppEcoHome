/**
 * Run the test suites, collect JUnit XML, and build a unified Allure report.
 *
 *   npm run test:report        # unit (Vitest) + edge functions (Deno)
 *   npm run test:report:e2e    # also runs Playwright E2E (needs local Supabase + dev server)
 *
 * Each suite is best-effort: a failing suite is captured in the report instead
 * of aborting it (the whole point is to SEE the failures). View the result with
 * `npm run report:open`. The raw JUnit XML for any Jira test app (AgileTest /
 * Qase / Xray …) lands in ./test-results/junit/.
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const JUNIT_DIR = "test-results/junit";
mkdirSync(JUNIT_DIR, { recursive: true });

// The repo's Deno tests run via the per-user install on Windows; plain `deno` elsewhere (CI).
const deno = process.platform === "win32"
  ? `"${process.env.USERPROFILE}\\.deno\\bin\\deno.exe"`
  : "deno";

function step(label, cmd) {
  console.log(`\n▶ ${label}`);
  try {
    execSync(cmd, { stdio: "inherit", shell: true });
  } catch {
    console.log(`  ⚠ ${label} reported failures — captured in the report.`);
  }
}

// Vitest + Playwright write JUnit via their config (outputFile); Deno streams JUnit to stdout.
step("Vitest — unit", "npx vitest run");
step(
  "Deno — edge functions",
  `${deno} test --allow-env --allow-net --env=.env.test --config supabase/tests/deno.json --reporter=junit supabase/tests/ > ${JUNIT_DIR}/deno.xml`,
);
if (process.argv.includes("--e2e")) {
  step("Playwright — E2E", "npx playwright test --pass-with-no-tests");
}

console.log("\n▶ Building Allure report");
execSync("npx allure generate test-results/junit --clean -o allure-report", { stdio: "inherit", shell: true });
console.log("\n✅ Report built at ./allure-report — open it with: npm run report:open");
console.log("   JUnit XML for Jira test apps is in ./test-results/junit/");
