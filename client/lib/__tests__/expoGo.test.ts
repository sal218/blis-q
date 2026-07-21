// isExpoGo() detects the Expo Go runtime (where custom native modules like
// MapLibre / Google Sign-In aren't bundled). Mirrors the expo-constants guard in
// googleAuth. The factory inlines the mock object; both isExpoGo's `Constants`
// and the imported `Constants` below reference that same singleton, so mutating
// `executionEnvironment` per test flips what isExpoGo() sees.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "storeClient" },
  ExecutionEnvironment: {
    StoreClient: "storeClient",
    Standalone: "standalone",
    Bare: "bare",
  },
}));

import Constants from "expo-constants";
import { isExpoGo } from "@/lib/expoGo";

const mockConstants = Constants as unknown as { executionEnvironment: string };

describe("isExpoGo", () => {
  it("true in Expo Go (storeClient)", () => {
    mockConstants.executionEnvironment = "storeClient";
    expect(isExpoGo()).toBe(true);
  });

  it("false in a standalone / dev-client (bare) build", () => {
    mockConstants.executionEnvironment = "standalone";
    expect(isExpoGo()).toBe(false);
    mockConstants.executionEnvironment = "bare";
    expect(isExpoGo()).toBe(false);
  });
});
