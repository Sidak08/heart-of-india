import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 3,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], extraHTTPHeaders: { "x-forwarded-for": "192.0.2.1" } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], extraHTTPHeaders: { "x-forwarded-for": "192.0.2.2" } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], extraHTTPHeaders: { "x-forwarded-for": "192.0.2.3" } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"], extraHTTPHeaders: { "x-forwarded-for": "192.0.2.4" } } },
  ],
  webServer: {
    command: `PORT=${port} SHEETS_TEST_MODE=true ORDER_ACCESS_SECRET=test-order-access-secret-at-least-thirty-two-characters OPERATOR_EMAIL=owner@example.com OPERATOR_PASSWORD_HASH='scrypt\\$MDEyMzQ1Njc4OWFiY2RlZg\\$YSoJIBxOMXyPCe_zAz87jDghCnPAJf4ktaMqRf02-JNoK35dFsgrhSCvDu1LPoF-J1IPw_AHwIPY4uWq-8J9UA' OPERATOR_SESSION_SECRET=test-operator-session-secret-at-least-thirty-two APP_URL=${baseURL} npm run dev`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
