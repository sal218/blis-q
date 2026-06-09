import type { Config } from "jest";

// Integration tests only (real test DB). Unit tests run via node:test (npm test).
// ts-jest compiles TS to CommonJS using tsconfig.jest.json so jest runs without
// ESM gymnastics. Path aliases mirror tsconfig.
const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  testMatch: ["**/server/__tests__/**/*.integration.test.ts"],
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/shared/$1",
    "^@/(.*)$": "<rootDir>/client/$1",
  },
  setupFiles: ["<rootDir>/server/__tests__/setup.ts"],
  // Run suites serially. They all share ONE real test DB and do global cleanup
  // deletes (e.g. removing all `user.login_failed` audit rows in afterEach).
  // Parallel suites would race — one suite's cleanup can delete a row another
  // suite's assertion depends on. Correctness over speed for shared-DB tests.
  maxWorkers: 1,
};

export default config;
