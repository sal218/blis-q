import * as SecureStore from "expo-secure-store";
import {
  saveSession,
  loadSession,
  clearSession,
  ACCESS_TOKEN_KEY,
  PROFILE_KEY,
} from "@/lib/session";
import type { SessionResponse } from "@shared/types";

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

function sessionWith(expiresAt: string): SessionResponse {
  return {
    user: {
      id: "u1",
      email: "ola@example.pl",
      displayName: "Ola",
      avatarUrl: null,
      isPremium: false,
      isAdmin: false,
      preferredCity: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    session: { accessToken: "at", refreshToken: "rt", expiresAt },
  };
}

beforeEach(async () => {
  await clearSession();
});

describe("loadSession — expiry handling", () => {
  it("valid (future expiry) → returns the stored session", async () => {
    await saveSession(sessionWith(FUTURE));
    const result = await loadSession();
    expect(result?.user.id).toBe("u1");
    expect(result?.accessToken).toBe("at");
  });

  it("expired (past expiry) → returns null AND clears the stored session", async () => {
    await saveSession(sessionWith(PAST));
    expect(await loadSession()).toBeNull();
    // The expired session is scrubbed so it can't be retried.
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("missing expiry → null", async () => {
    await saveSession(sessionWith(""));
    expect(await loadSession()).toBeNull();
  });

  it("invalid (unparseable) expiry → null", async () => {
    await saveSession(sessionWith("not-a-date"));
    expect(await loadSession()).toBeNull();
  });

  it("corrupt profile JSON → null (no throw)", async () => {
    await saveSession(sessionWith(FUTURE));
    await SecureStore.setItemAsync(PROFILE_KEY, "{ not valid json");
    expect(await loadSession()).toBeNull();
  });

  it("no stored session → null", async () => {
    expect(await loadSession()).toBeNull();
  });
});
