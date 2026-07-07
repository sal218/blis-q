// Token-refresh-on-401 interceptor in the shared request() chokepoint (P-10).
// Mocks the network boundary + the registered refresh/expired/suspended handlers.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  request,
  registerRefreshHandler,
  registerSessionExpiredHandler,
  registerSuspendedHandler,
} from "@/lib/api/http";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

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

const onOk = (r: Response) => r.json();
const mapError = async () => ({ kind: "server" as const });
const call = (path = "/api/v1/communities") =>
  request("GET", path, undefined, onOk, mapError);

let refresh: jest.Mock;
let onExpired: jest.Mock;
let onSuspended: jest.Mock;

beforeEach(() => {
  fetchMock.mockReset();
  refresh = jest.fn();
  onExpired = jest.fn();
  onSuspended = jest.fn();
  registerRefreshHandler(refresh);
  registerSessionExpiredHandler(onExpired);
  registerSuspendedHandler(onSuspended);
});

afterEach(() => {
  registerRefreshHandler(null);
  registerSessionExpiredHandler(null);
  registerSuspendedHandler(null);
});

describe("request() — token refresh on 401 (P-10)", () => {
  it("401 then refresh ok → retries the original once and returns the retry result", async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(res(200, { value: 1 }));
    refresh.mockResolvedValue("ok");

    const result = await call();

    expect(result).toEqual({ ok: true, data: { value: 1 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + one retry
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("401 then refresh failed → fires sessionExpiredHandler, returns mapped error, no retry", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));
    refresh.mockResolvedValue("failed");

    const result = await call();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it("401 then refresh offline → keeps the session (no logout, no retry) — P-10a", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));
    refresh.mockResolvedValue("offline");

    const result = await call();

    // A transient refresh failure must NOT force a logout…
    expect(onExpired).not.toHaveBeenCalled();
    expect(onSuspended).not.toHaveBeenCalled();
    // …and there's no retry (the refresh couldn't complete). The original 401
    // falls through to the mapped error, so the caller sees a transient failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("401 then refresh suspended → fires suspendedHandler", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));
    refresh.mockResolvedValue("suspended");

    await call();

    expect(onSuspended).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("401 on an AUTH endpoint → no refresh, no sessionExpired (bad credentials)", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "Invalid credentials" }));

    const result = await call("/api/v1/auth/login");

    expect(refresh).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("retry that returns 403 account_suspended → fires suspendedHandler", async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(res(403, SUSPENDED));
    refresh.mockResolvedValue("ok");

    await call();

    expect(onSuspended).toHaveBeenCalledTimes(1);
  });

  it("two concurrent 401s → refresh runs once (single-flight)", async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValue(res(200, { ok: true }));
    refresh.mockResolvedValue("ok");

    await Promise.all([call(), call()]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a retry that 401s again is NOT re-refreshed", async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(401, {}));
    refresh.mockResolvedValue("ok");

    const result = await call();

    expect(refresh).toHaveBeenCalledTimes(1); // only the first 401 triggers refresh
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });
});
