// Mock the network boundary; assert query-string composition + status mapping.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { listResources, getResource } from "@/lib/api/resources";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const RESOURCE = {
  id: "r1",
  title: "Telefon zaufania",
  category: "mental_health",
  body: "Wsparcie w kryzysie.",
  url: "https://example.org",
  featured: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};
const PAGE = {
  data: [RESOURCE],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
};

beforeEach(() => fetchMock.mockReset());

describe("listResources", () => {
  it("no params → the base path", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    expect(await listResources({})).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/resources",
      undefined,
    );
  });

  it("composes page + (encoded) category + (encoded) search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listResources({
      page: 2,
      category: "legal_rights",
      search: "Kraków",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/resources?page=2&category=legal_rights&search=Krak%C3%B3w",
      undefined,
    );
  });

  it("omits a blank search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listResources({ search: "   " });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/resources",
      undefined,
    );
  });

  it("400 → validation; 429 → rateLimited; 5xx → server; network", async () => {
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listResources({})).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listResources({})).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listResources({})).toEqual({
      ok: false,
      error: { kind: "server" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listResources({})).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("getResource", () => {
  it("GET /:id → the DTO", async () => {
    fetchMock.mockResolvedValue(res(200, RESOURCE));
    expect(await getResource("r1")).toEqual({ ok: true, data: RESOURCE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/resources/r1",
      undefined,
    );
  });

  it("maps a 404 (resource gone) to server", async () => {
    fetchMock.mockResolvedValue(res(404, {}));
    expect(await getResource("r1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });
});
