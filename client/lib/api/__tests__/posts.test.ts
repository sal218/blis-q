// Mock the network boundary; assert the status→PostsResult mapping and the
// cursor query-string only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  listCommunityPosts,
  reportPost,
  createPost,
  deletePost,
} from "@/lib/api/posts";

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
      id: "p1",
      communityId: "c1",
      author: { id: "u1", displayName: "Marta", avatarUrl: null },
      content: "Cześć",
      imageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      deleted: false,
    },
  ],
  nextCursor: "cursor-2",
};

beforeEach(() => fetchMock.mockReset());

describe("posts API client — listCommunityPosts", () => {
  it("200 → ok with the cursor page; no cursor in the query on page 1", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    const result = await listCommunityPosts("c1");
    expect(result).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities/c1/posts",
      undefined,
    );
  });

  it("appends the (encoded) cursor when paginating", async () => {
    fetchMock.mockResolvedValue(res(200, { data: [], nextCursor: null }));
    await listCommunityPosts("c1", "a b/c");
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities/c1/posts?cursor=a%20b%2Fc",
      undefined,
    );
  });

  it("404 → notFound; 400 → validation; 429 → rateLimited(retryAfter); 5xx → server", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await listCommunityPosts("c1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listCommunityPosts("c1")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listCommunityPosts("c1")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listCommunityPosts("c1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });

  it("fetch throwing → network", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listCommunityPosts("c1")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("posts API client — reportPost", () => {
  it("201 → ok and posts the reason", async () => {
    fetchMock.mockResolvedValue(res(201, { ok: true }));
    const result = await reportPost("p1", "spam");
    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith("POST", "/api/v1/posts/p1/report", {
      reason: "spam",
    });
  });

  it("404 → notFound (post no longer visible); 400 → validation; 429 → rateLimited", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await reportPost("p1", "x")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await reportPost("p1", "x")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 12 }));
    expect(await reportPost("p1", "x")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 12 },
    });
  });
});

describe("posts API client — createPost", () => {
  const CREATED = {
    id: "p9",
    communityId: "c1",
    author: { id: "u1", displayName: "Marta", avatarUrl: null },
    content: "Nowy",
    imageUrl: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    deleted: false,
  };

  it("201 → ok with the created PostDTO and posts the content", async () => {
    fetchMock.mockResolvedValue(res(201, CREATED));
    expect(await createPost("c1", "Nowy")).toEqual({ ok: true, data: CREATED });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/communities/c1/posts",
      { content: "Nowy" },
    );
  });

  it("403 → forbidden; 404 → notFound; 400 → validation; 429 → rateLimited; network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await createPost("c1", "x")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await createPost("c1", "x")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await createPost("c1", "x")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 9 }));
    expect(await createPost("c1", "x")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 9 },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await createPost("c1", "x")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("posts API client — deletePost", () => {
  it("200 → ok and issues DELETE", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await deletePost("p1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "DELETE",
      "/api/v1/posts/p1",
      undefined,
    );
  });

  it("403 → forbidden; 404 → notFound; 400 → validation; network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await deletePost("p1")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await deletePost("p1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await deletePost("p1")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await deletePost("p1")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});
