import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, EDITOR, asUser } from "./e2e/support/env";

// oxlint-disable-next-line unicorn/no-process-env
const isCI = Boolean(process.env.CI);

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  retries: isCI ? 1 : 0,
  testDir: "e2e",
  // *.e2e.ts keeps these out of `bun test`, which picks up *.test.* and *.spec.*
  testMatch: "**/*.e2e.ts",
  use: {
    baseURL: BASE_URL,
    // Act as an editor by default; specs override this to test other users.
    extraHTTPHeaders: asUser(EDITOR),
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run build && bun e2e/support/server.ts",
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: `${BASE_URL}/favicon.ico`,
  },
});
