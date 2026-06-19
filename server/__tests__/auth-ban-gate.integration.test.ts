// Focused middleware test (no DB) for the banned-user auth gate (P-15). Mocks
// the JWT layer, the storage profile lookup, and Redis so we exercise the REAL
// isAuthenticated / isAuthenticatedAllowBanned logic — which the other suites
// can't, because they mock the middleware entirely. Named *.integration so the
// jest runner picks it up.
jest.mock("jose", () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(() => ({})),
}));

jest.mock("../redis", () => ({ redis: null })); // force the slow (DB) path

jest.mock("../storage", () => ({
  storage: { getUser: jest.fn() },
}));

import { jwtVerify } from "jose";
import { isAuthenticated, isAuthenticatedAllowBanned } from "../auth";
import { storage } from "../storage";

const jwtVerifyMock = jwtVerify as unknown as jest.Mock;
const getUserMock = storage.getUser as unknown as jest.Mock;

const USER_ID = "11111111-1111-1111-1111-111111111111";

type Res = {
  statusCode?: number;
  body?: unknown;
  status(code: number): Res;
  json(body: unknown): Res;
};

function mockRes(): Res {
  const res = {} as Res;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

function profile(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: USER_ID,
    email: "u@example.com",
    displayName: "U",
    isPremium: false,
    isAdmin: false,
    deletedAt: null,
    bannedAt: null,
    ...over,
  };
}

beforeAll(() => {
  process.env.SUPABASE_URL =
    process.env.SUPABASE_URL ?? "https://test.supabase.co";
});

beforeEach(() => {
  jest.clearAllMocks();
  jwtVerifyMock.mockResolvedValue({ payload: { sub: USER_ID, email: "u@x" } });
});

const req = () => ({ headers: { authorization: "Bearer tok" } }) as never;

describe("isAuthenticated — banned gate", () => {
  it("active user → calls next()", async () => {
    getUserMock.mockResolvedValue(profile());
    const res = mockRes();
    const next = jest.fn();
    await isAuthenticated(req(), res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });

  it("banned user → 403 Account suspended, next NOT called", async () => {
    getUserMock.mockResolvedValue(profile({ bannedAt: new Date() }));
    const res = mockRes();
    const next = jest.fn();
    await isAuthenticated(req(), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Account suspended" });
  });

  it("deleted user → 401, next NOT called", async () => {
    getUserMock.mockResolvedValue(profile({ deletedAt: new Date() }));
    const res = mockRes();
    const next = jest.fn();
    await isAuthenticated(req(), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("isAuthenticatedAllowBanned — GDPR rights stay reachable", () => {
  it("banned user → calls next() (export/erasure remain accessible)", async () => {
    getUserMock.mockResolvedValue(profile({ bannedAt: new Date() }));
    const res = mockRes();
    const next = jest.fn();
    const r = { headers: { authorization: "Bearer tok" }, user: undefined } as {
      headers: { authorization: string };
      user?: { banned: boolean };
    };
    await isAuthenticatedAllowBanned(r as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
    expect(r.user?.banned).toBe(true);
  });

  it("deleted user → still 401 (erased accounts are not resolved)", async () => {
    getUserMock.mockResolvedValue(profile({ deletedAt: new Date() }));
    const res = mockRes();
    const next = jest.fn();
    await isAuthenticatedAllowBanned(req(), res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
