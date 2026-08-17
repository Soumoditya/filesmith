import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The document tests build real PDFs and re-parse them with pdf.js.
    // That is genuinely slow work, and the 5s default made correct tests
    // fail intermittently under load — a flaky suite teaches you to ignore
    // it, which is worse than a slow one.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
