import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/test/**/*.test.ts"],
    reporters: ["default"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});
