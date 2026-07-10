// Mock the network boundary; assert query-string composition + status mapping.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { listCrisisContacts } from "@/lib/api/crisisContacts";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const CONTACT = {
  id: "c1",
  name: "Telefon zaufania",
  phone: "116 123",
  description: "Wsparcie w kryzysie emocjonalnym.",
  hours: "Całodobowo",
  category: "emotional_crisis",
  verified: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};
const PAGE = {
  data: [CONTACT],
  page: 1,
  pageSize: 100,
  total: 1,
  totalPages: 1,
};

beforeEach(() => fetchMock.mockReset());

describe("listCrisisContacts", () => {
  it("no params → the base path (public read)", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    expect(await listCrisisContacts({})).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/crisis-contacts",
      undefined,
    );
  });

  it("composes page + pageSize + (encoded) category", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listCrisisContacts({
      page: 2,
      pageSize: 100,
      category: "emotional_crisis",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/crisis-contacts?page=2&pageSize=100&category=emotional_crisis",
      undefined,
    );
  });

  it("400 → validation; 429 → rateLimited; 5xx → server; network", async () => {
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listCrisisContacts({})).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listCrisisContacts({})).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listCrisisContacts({})).toEqual({
      ok: false,
      error: { kind: "server" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listCrisisContacts({})).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});
