import type { Config } from "jest";

// Client (React Native / Expo) tests. The `jest-expo` preset wires the RN +
// Expo transform (babel-preset-expo, including TS + JSX) and the RN jest
// environment. Kept entirely separate from jest.config.ts (server integration,
// ts-jest, node env) so the two test worlds never collide. Run via
// `npm run test:client`. Covers both pure-logic units (validation, error
// mapping, consent/retry logic) and light component tests (@testing-library).
const config: Config = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/client/__tests__/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/client/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1",
    "^@assets/(.*)$": "<rootDir>/assets/$1",
  },
  testMatch: [
    "<rootDir>/client/**/__tests__/**/*.test.ts",
    "<rootDir>/client/**/__tests__/**/*.test.tsx",
  ],
  // jest-expo's first React Native render pays a cold-start cost that can exceed
  // the default 5s on slower CI runners (a component suite intermittently timed
  // out on its first test). 15s gives RN-rendering suites headroom without
  // masking real hangs.
  testTimeout: 15000,
};

export default config;
