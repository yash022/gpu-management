import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node ../backend/server.js",
      url: "http://127.0.0.1:5001/api/health",
      env: {
        PORT: "5001",
        DATABASE_URL: "",
        NODE_ENV: "test",
        FRONTEND_ORIGIN: "http://127.0.0.1:5174",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      env: { API_PROXY_TARGET: "http://127.0.0.1:5001" },
    },
  ],
});
