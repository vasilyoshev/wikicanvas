import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a built static web export served by scripts/e2e-web-server.js.
// They live in test/e2e/ and are kept separate from unit suites. Default port 8099;
// override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 8099);

// Deterministic Supabase CLI default anon key (same on every machine and CI).
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: /.*\.e2e\.test\.ts$/,
  fullyParallel: true,
  workers: process.env.CI ? 4 : 6,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `node scripts/e2e-web-server.js ${PORT}`,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_ANON_KEY,
      EXPO_PUBLIC_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "1",
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
