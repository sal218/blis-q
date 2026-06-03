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
};

export default config;
