import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "PORT=4173 DB_PATH=/tmp/buruburu-browser-test.sqlite npm start",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
  },
});
