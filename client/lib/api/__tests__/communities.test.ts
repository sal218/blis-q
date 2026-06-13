// Mock the network boundary; assert the status→CommunityResult mapping and the
// query-string building only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  listCommunities,
  getCommunity,
  createCommunity,
  joinCommunity,
  leaveCommunity,
} from "@/lib/api/communities";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const PAGE = {
  data: [
    {
      id: "c1",
      name: "Queer Creatives",
      description: "A space",
      imageUrl: null,
      memberCount: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      membership: null,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const COMMUNITY = PAGE.data[0];

beforeEach(() => fetchMock.mockReset());

describe("communities API client mapping", () => {
  it("listCommunities 200 → ok page data", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    const result = await listCommunities();
    expect(result).toEqual({ ok: true, data: PAGE });
  });

  it("listCommunities builds the query string from params (page/pageSize/search)", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listCommunities({ page: 2, pageSize: 20, search: "queer art" });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities?page=2&pageSize=20&search=queer%20art",
      undefined,
    );
  });

  it("listCommunities omits blank search and unset params", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listCommunities({ search: "   " });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities",
      undefined,
    );
  });

  it("getCommunity 404 → notFound", async () => {
    fetchMock.mockResolvedValue(res(404, { error: "Not found" }));
    const result = await getCommunity("missing");
    expect(result).toEqual({ ok: false, error: { kind: "notFound" } });
  });

  it("createCommunity 201 → ok community", async () => {
    fetchMock.mockResolvedValue(res(201, COMMUNITY));
    const result = await createCommunity({ name: "Queer Creatives" });
    expect(result).toEqual({ ok: true, data: COMMUNITY });
  });

  it("createCommunity 400 → validation", async () => {
    fetchMock.mockResolvedValue(res(400, { error: "Invalid input" }));
    const result = await createCommunity({ name: "x" });
    expect(result).toEqual({ ok: false, error: { kind: "validation" } });
  });

  it("joinCommunity 200 → role member", async () => {
    fetchMock.mockResolvedValue(res(200, { role: "member" }));
    const result = await joinCommunity("c1");
    expect(result).toEqual({ ok: true, data: { role: "member" } });
  });

  it("joinCommunity 409 → conflict (already a member)", async () => {
    fetchMock.mockResolvedValue(res(409, { error: "Already a member" }));
    const result = await joinCommunity("c1");
    expect(result).toEqual({ ok: false, error: { kind: "conflict" } });
  });

  it("leaveCommunity 200 → ok", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const result = await leaveCommunity("c1");
    expect(result).toEqual({ ok: true, data: { ok: true } });
  });

  it("leaveCommunity 409 → conflict (sole admin)", async () => {
    fetchMock.mockResolvedValue(
      res(409, { error: "Community must have at least one admin" }),
    );
    const result = await leaveCommunity("c1");
    expect(result).toEqual({ ok: false, error: { kind: "conflict" } });
  });

  it("429 → rateLimited with retryAfter", async () => {
    fetchMock.mockResolvedValue(res(429, { retryAfter: 30 }));
    const result = await createCommunity({ name: "x" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });
  });

  it("5xx → server", async () => {
    fetchMock.mockResolvedValue(res(500, { error: "Internal Server Error" }));
    const result = await getCommunity("c1");
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("fetch throwing → network", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await listCommunities();
    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
});
