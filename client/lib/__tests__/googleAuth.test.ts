// Regression for the Expo Go crash: the native Google Sign-In module isn't
// bundled in Expo Go, and evaluating it there throws "RNGoogleSignin could not
// be found" (it surfaced on logout, which calls signOutGoogle). googleAuth now
// detects Expo Go via Constants.executionEnvironment and NEVER loads the native
// module there — sign-in returns { status: "error" }, sign-out is a no-op.
//
// Simulate Expo Go (executionEnvironment === "storeClient"). The native module
// is additionally mocked to throw if it were ever required, proving the guard
// short-circuits before any load is attempted.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "storeClient" },
  ExecutionEnvironment: {
    StoreClient: "storeClient",
    Standalone: "standalone",
    Bare: "bare",
  },
}));
jest.mock("@react-native-google-signin/google-signin", () => {
  throw new Error("Native module RNGoogleSignin is not available (Expo Go)");
});

import { signInWithGoogle, signOutGoogle } from "@/lib/googleAuth";

describe("googleAuth in Expo Go (native module not bundled)", () => {
  it("imports without crashing", () => {
    expect(typeof signInWithGoogle).toBe("function");
    expect(typeof signOutGoogle).toBe("function");
  });

  it("signInWithGoogle resolves to { status: 'error' } instead of throwing", async () => {
    await expect(signInWithGoogle()).resolves.toEqual({ status: "error" });
  });

  it("signOutGoogle resolves as a safe no-op instead of throwing", async () => {
    await expect(signOutGoogle()).resolves.toBeUndefined();
  });
});
