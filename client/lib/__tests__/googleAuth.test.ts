// Regression for the Expo Go boot bug: the native Google Sign-In module is not
// bundled in Expo Go, so importing it at module load crashed the app before the
// email/password UI was usable. googleAuth now lazy-imports it, so the module
// must be importable WITHOUT the native dependency, and the Google actions must
// degrade gracefully instead of throwing.
//
// We simulate "native module unavailable / throws on load" by making the module
// throw when required. This jest.mock overrides the working mock in
// client/__tests__/setup.ts for this file only. Because googleAuth only does a
// dynamic import(), the throw happens when a Google action runs — not at import
// of googleAuth itself, which is exactly the boot guarantee we need.
jest.mock("@react-native-google-signin/google-signin", () => {
  throw new Error("Native module RNGoogleSignin is not available (Expo Go)");
});

import { signInWithGoogle, signOutGoogle } from "@/lib/googleAuth";

describe("googleAuth with the native module unavailable (Expo Go)", () => {
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
