import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const systemChromium = existsSync("/usr/bin/chromium")
  ? "/usr/bin/chromium"
  : undefined;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:5188",
    browserName: "chromium",
    headless: true,
    ...(systemChromium
      ? {
          launchOptions: {
            executablePath: systemChromium,
            args: ["--no-sandbox"],
          },
        }
      : {}),
  },
  webServer: {
    command: `${npmCommand} run dev -- --host 127.0.0.1 --port 5188 --strictPort`,
    url: "http://127.0.0.1:5188",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
  },
  reporter: "list",
});
