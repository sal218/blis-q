// Mock the network boundary; assert the query-string composition + status mapping.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  listSafePlaces,
  listSavedSafePlaces,
  getSafePlace,
  reportSafePlace,
  saveSafePlace,
  unsaveSafePlace,
} from "@/lib/api/safePlaces";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const PLACE = {
  id: "s1",
  name: "Tęczowa Kawiarnia",
  category: "cafe",
  description: null,
  address: "Marszałkowska 10",
  city: "Warszawa",
  latitude: 52.23,
  longitude: 21.01,
};
const PAGE = { data: [PLACE], page: 1, pageSize: 25, total: 1, totalPages: 1 };

beforeEach(() => fetchMock.mockReset());

describe("listSafePlaces", () => {
  it("no params → the base path", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    expect(await listSafePlaces({})).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/safe-places",
      undefined,
    );
  });

  it("composes page + category + (encoded) search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listSafePlaces({ page: 2, category: "club", search: "Kraków" });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/safe-places?page=2&category=club&search=Krak%C3%B3w",
      undefined,
    );
  });

  it("omits a blank search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listSafePlaces({ search: "   " });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/safe-places",
      undefined,
    );
  });

  it("400 → validation; 429 → rateLimited; 5xx → server; network", async () => {
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listSafePlaces({})).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listSafePlaces({})).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listSafePlaces({})).toEqual({
      ok: false,
      error: { kind: "server" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listSafePlaces({})).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });

  it("listSavedSafePlaces → GET /safe-places/saved", async () => {
    fetchMock.mockResolvedValue(res(200, [PLACE]));
    expect(await listSavedSafePlaces()).toEqual({ ok: true, data: [PLACE] });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/safe-places/saved",
      undefined,
    );
  });

  it("getSafePlace → GET /:id → the DTO", async () => {
    fetchMock.mockResolvedValue(res(200, PLACE));
    expect(await getSafePlace("p1")).toEqual({ ok: true, data: PLACE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/safe-places/p1",
      undefined,
    );
  });

  it("getSafePlace maps a 404 to server (place gone)", async () => {
    fetchMock.mockResolvedValue(res(404, {}));
    expect(await getSafePlace("p1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });

  it("reportSafePlace → POST /:id/report with the reason", async () => {
    fetchMock.mockResolvedValue(res(201, { ok: true }));
    expect(await reportSafePlace("p1", "spam")).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/safe-places/p1/report",
      { reason: "spam" },
    );
  });

  it("saveSafePlace → POST /:id/save → { ok: true }", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await saveSafePlace("p1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/safe-places/p1/save",
      undefined,
    );
  });

  it("unsaveSafePlace → DELETE /:id/save → { ok: true }", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await unsaveSafePlace("p1")).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "DELETE",
      "/api/v1/safe-places/p1/save",
      undefined,
    );
  });

  it("saveSafePlace on a 404 (place vanished) → server error (reverts the toggle)", async () => {
    // commonApiError has no notFound kind; a 404 falls through to `server`,
    // which the optimistic toggle treats as failure → reverts the flip.
    fetchMock.mockResolvedValue(res(404, {}));
    expect(await saveSafePlace("p1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });
});
