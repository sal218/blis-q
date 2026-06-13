// Mock the network boundary; assert the status→ApiResult mapping only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { signUp, login, resetPassword, googleSignIn } from "@/lib/api/auth";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SESSION = {
  user: { id: "u1", email: "a@b.pl", displayName: "Ola" },
  session: { accessToken: "at", refreshToken: "rt", expiresAt: "2030-01-01" },
};

const VALID_SIGNUP = {
  email: "a@b.pl",
  password: "supersecret",
  displayName: "Ola",
  consentedTypes: ["account_creation" as const],
  policyVersion: "2026-06-10",
};

beforeEach(() => fetchMock.mockReset());

describe("auth API client mapping", () => {
  it("signup 202 → accepted", async () => {
    fetchMock.mockResolvedValue(res(202, { ok: true }));
    await expect(signUp(VALID_SIGNUP)).resolves.toEqual({
      ok: true,
      data: { accepted: true },
    });
  });

  it("login 200 → session data", async () => {
    fetchMock.mockResolvedValue(res(200, SESSION));
    const result = await login("a@b.pl", "supersecret");
    expect(result).toEqual({ ok: true, data: SESSION });
  });

  it("login 401 → invalidCredentials", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "Invalid credentials" }));
    const result = await login("a@b.pl", "x");
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalidCredentials" },
    });
  });

  it("429 → rateLimited carrying retryAfter", async () => {
    fetchMock.mockResolvedValue(res(429, { retryAfter: 42 }));
    const result = await login("a@b.pl", "x");
    expect(result).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 42 },
    });
  });

  it("429 with no retryAfter → defaults to 60", async () => {
    fetchMock.mockResolvedValue(res(429, {}));
    const result = await login("a@b.pl", "x");
    expect(result).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 60 },
    });
  });

  it("google 422 → consentRequired", async () => {
    fetchMock.mockResolvedValue(res(422, { error: "consent_required" }));
    const result = await googleSignIn({ idToken: "tok" });
    expect(result).toEqual({ ok: false, error: { kind: "consentRequired" } });
  });

  it("400 → validation", async () => {
    fetchMock.mockResolvedValue(res(400, { error: "Invalid input" }));
    const result = await resetPassword("tok", "supersecret");
    expect(result).toEqual({ ok: false, error: { kind: "validation" } });
  });

  it("500 → server", async () => {
    fetchMock.mockResolvedValue(res(500, { error: "Internal Server Error" }));
    const result = await login("a@b.pl", "x");
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("fetch throwing → network", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await login("a@b.pl", "x");
    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
});
