// Account-suspension detection in the shared request() chokepoint (P-20). Mocks
// the network boundary; asserts the global suspension handler fires exactly once
// on a 403 { code: "account_suspended" }, never on other responses, survives a
// throwing/rejecting handler, and ignores stale / concurrent generations.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  request,
  registerSuspendedHandler,
  bumpSuspensionGeneration,
} from "@/lib/api/http";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

// A Response double WITH clone() (the detection peeks via res.clone().json()).
function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return { json: async () => body } as unknown as Response;
    },
  } as unknown as Response;
}

const SUSPENDED = { error: "Account suspended", code: "account_suspended" };

// Minimal onOk/mapError so request() runs; we only assert the handler side effect.
const onOk = (r: Response) => r.json();
const mapError = async () => ({ kind: "server" as const });
const call = () => request("GET", "/x", undefined, onOk, mapError);

let handler: jest.Mock;

beforeEach(() => {
  fetchMock.mockReset();
  handler = jest.fn();
  registerSuspendedHandler(handler);
});

afterEach(() => registerSuspendedHandler(null));

describe("request() — account-suspension detection", () => {
  it("403 with account_suspended code → handler fires once, mapped error returned", async () => {
    fetchMock.mockResolvedValue(res(403, SUSPENDED));
    const result = await call();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("403 WITHOUT the code → handler NOT fired", async () => {
    fetchMock.mockResolvedValue(res(403, { error: "Forbidden" }));
    await call();
    expect(handler).not.toHaveBeenCalled();
  });

  it("404 / 500 / 200 → handler NOT fired", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { error: "Not found" }));
    await call();
    fetchMock.mockResolvedValueOnce(res(500, { error: "Server" }));
    await call();
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));
    await call();
    expect(handler).not.toHaveBeenCalled();
  });

  it("a throwing handler still lets request() return the mapped error", async () => {
    registerSuspendedHandler(() => {
      throw new Error("boom");
    });
    fetchMock.mockResolvedValue(res(403, SUSPENDED));
    await expect(call()).resolves.toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });

  it("a rejecting (async) handler still lets request() return the mapped error", async () => {
    registerSuspendedHandler(async () => {
      throw new Error("boom");
    });
    fetchMock.mockResolvedValue(res(403, SUSPENDED));
    await expect(call()).resolves.toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });

  it("a stale generation (boundary mid-flight) does NOT fire the handler", async () => {
    // Simulate a session boundary (sign-out/dismiss) landing between issue and
    // response: the request captured the old generation, which is now stale.
    fetchMock.mockImplementation(async () => {
      bumpSuspensionGeneration();
      return res(403, SUSPENDED);
    });
    await call();
    expect(handler).not.toHaveBeenCalled();
  });

  it("two concurrent same-generation 403s → handler fires exactly once", async () => {
    fetchMock.mockResolvedValue(res(403, SUSPENDED));
    await Promise.all([call(), call()]);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
