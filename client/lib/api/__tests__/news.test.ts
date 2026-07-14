// Mock the network boundary; assert query-string composition + status mapping.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { listNews, getArticle } from "@/lib/api/news";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ARTICLE = {
  id: "n1",
  title: "Parlament Europejski",
  summary: "Rezolucja w sprawie praw.",
  body: "Pełna treść.",
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};
const PAGE = {
  data: [ARTICLE],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
};

beforeEach(() => fetchMock.mockReset());

describe("listNews", () => {
  it("no params → the base path", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    expect(await listNews({})).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/news", undefined);
  });

  it("composes page + (encoded) category + (encoded) search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listNews({ page: 2, category: "rights", search: "Kraków" });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/news?page=2&category=rights&search=Krak%C3%B3w",
      undefined,
    );
  });

  it("omits a blank search", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listNews({ search: "   " });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/news", undefined);
  });

  it("400 → validation; 429 → rateLimited; 5xx → server; network", async () => {
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listNews({})).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listNews({})).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listNews({})).toEqual({
      ok: false,
      error: { kind: "server" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listNews({})).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("getArticle", () => {
  it("GET /:id → the DTO", async () => {
    fetchMock.mockResolvedValue(res(200, ARTICLE));
    expect(await getArticle("n1")).toEqual({ ok: true, data: ARTICLE });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/news/n1", undefined);
  });

  it("maps a 404 (article gone) to server", async () => {
    fetchMock.mockResolvedValue(res(404, {}));
    expect(await getArticle("n1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });
});
