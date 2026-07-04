// Mock the network boundary; assert the query-string composition + status mapping.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { listSafePlaces } from "@/lib/api/safePlaces";

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
});
