// refreshSession() primitive (P-10): exchanges the stored refresh token for a
// fresh session via a plain fetch. SecureStore is the in-memory mock (setup.ts);
// global fetch is mocked here.
import * as SecureStore from "expo-secure-store";
import {
  refreshSession,
  REFRESH_TOKEN_KEY,
  ACCESS_TOKEN_KEY,
} from "@/lib/session";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const SESSION = {
  user: { id: "u1", email: "a@b.pl", displayName: "Ola" },
  session: {
    accessToken: "new-at",
    refreshToken: "new-rt",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
};

beforeEach(async () => {
  fetchMock.mockReset();
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
});

describe("refreshSession", () => {
  it("200 → persists the rotated session and returns 'ok'", async () => {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, "rt");
    fetchMock.mockResolvedValue(res(200, SESSION));

    await expect(refreshSession()).resolves.toBe("ok");

    // The new session is persisted.
    expect(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)).toBe("new-at");
    expect(await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)).toBe("new-rt");
    // The stored refresh token was posted to /refresh.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/auth/refresh");
    expect(init.body).toBe(JSON.stringify({ refreshToken: "rt" }));
  });

  it("403 account_suspended → 'suspended'", async () => {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, "rt");
    fetchMock.mockResolvedValue(res(403, { code: "account_suspended" }));

    await expect(refreshSession()).resolves.toBe("suspended");
  });

  it("no stored refresh token → 'failed', no network call", async () => {
    await expect(refreshSession()).resolves.toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 (invalid/expired refresh token) → 'failed'", async () => {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, "rt");
    fetchMock.mockResolvedValue(res(401, { error: "Invalid credentials" }));

    await expect(refreshSession()).resolves.toBe("failed");
  });

  it("network throw → 'failed'", async () => {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, "rt");
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(refreshSession()).resolves.toBe("failed");
  });
});
