import * as SecureStore from "expo-secure-store";
import {
  saveSession,
  loadSession,
  clearSession,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  PROFILE_KEY,
} from "@/lib/session";
import type { SessionResponse } from "@shared/types";

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

// loadSession now refreshes on a genuinely-expired token (cold-start, P-10), so
// the refresh network call must be mocked.
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function sessionWith(expiresAt: string, accessToken = "at"): SessionResponse {
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
    session: { accessToken, refreshToken: "rt", expiresAt },
  };
}

beforeEach(async () => {
  await clearSession();
  fetchMock.mockReset();
});

describe("loadSession — expiry handling", () => {
  it("valid (future expiry) → returns the stored session, no refresh", async () => {
    await saveSession(sessionWith(FUTURE));
    const result = await loadSession();
    expect(result?.user.id).toBe("u1");
    expect(result?.accessToken).toBe("at");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("missing expiry → null + cleared, no refresh", async () => {
    await saveSession(sessionWith(""));
    expect(await loadSession()).toBeNull();
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalid (unparseable) expiry → null, no refresh", async () => {
    await saveSession(sessionWith("not-a-date"));
    expect(await loadSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("corrupt profile JSON → null (no throw), no refresh", async () => {
    await saveSession(sessionWith(FUTURE));
    await SecureStore.setItemAsync(PROFILE_KEY, "{ not valid json");
    expect(await loadSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no stored session → null, no refresh", async () => {
    expect(await loadSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadSession — cold-start refresh (P-10)", () => {
  it("expired + valid refresh token → refreshes and returns the NEW session", async () => {
    await saveSession(sessionWith(PAST));
    // The /refresh response: a rotated, future-dated session.
    fetchMock.mockResolvedValue(res(200, sessionWith(FUTURE, "new-at")));

    const result = await loadSession();

    expect(result?.accessToken).toBe("new-at");
    expect(result?.user.id).toBe("u1");
    // The rotated session is persisted.
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBe("new-at");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expired + refresh fails (401) → null AND clears the store", async () => {
    await saveSession(sessionWith(PAST));
    fetchMock.mockResolvedValue(res(401, { error: "Invalid credentials" }));

    expect(await loadSession()).toBeNull();
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("expired + refresh suspended (403 account_suspended) → null AND clears", async () => {
    await saveSession(sessionWith(PAST));
    fetchMock.mockResolvedValue(res(403, { code: "account_suspended" }));

    expect(await loadSession()).toBeNull();
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("expired + no refresh token → null, no refresh attempted", async () => {
    await saveSession(sessionWith(PAST));
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);

    expect(await loadSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
