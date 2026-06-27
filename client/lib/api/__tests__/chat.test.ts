// Mock the network boundary; assert the status→ChatResult mapping, the cursor
// query-string, and the request bodies only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  listChats,
  listCommunityMessages,
  sendMessage,
  deleteMessage,
  reportMessage,
} from "@/lib/api/chat";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const MESSAGE = {
  id: "m1",
  communityId: "c1",
  sender: { id: "u1", displayName: "Marta", avatarUrl: null },
  content: "Cześć",
  createdAt: "2026-01-01T00:00:00.000Z",
  deleted: false,
};

beforeEach(() => fetchMock.mockReset());

describe("chat API client — listCommunityMessages", () => {
  it("200 → ok; no cursor on page 1; encodes the cursor when paginating", async () => {
    const page = { data: [MESSAGE], nextCursor: "cur-2" };
    fetchMock.mockResolvedValue(res(200, page));
    expect(await listCommunityMessages("c1")).toEqual({ ok: true, data: page });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities/c1/messages",
      undefined,
    );

    fetchMock.mockResolvedValue(res(200, { data: [], nextCursor: null }));
    await listCommunityMessages("c1", "a b/c");
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/communities/c1/messages?cursor=a%20b%2Fc",
      undefined,
    );
  });

  it("403 → forbidden (non-member); 404 → notFound; 400 → validation; 429 → rateLimited; 5xx → server; throw → network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });
    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });
    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "server" },
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listCommunityMessages("c1")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("chat API client — listChats (inbox)", () => {
  it("200 → ok with ChatSummaryDTO[]; GET /api/v1/chats (no params)", async () => {
    const inbox = [
      {
        community: { id: "c1", name: "Queer Creatives", imageUrl: null },
        role: "member",
        lastMessage: null,
      },
    ];
    fetchMock.mockResolvedValue(res(200, inbox));
    expect(await listChats()).toEqual({ ok: true, data: inbox });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/chats", undefined);
  });

  it("5xx → server; throw → network", async () => {
    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listChats()).toEqual({ ok: false, error: { kind: "server" } });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listChats()).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("chat API client — sendMessage", () => {
  it("201 → ok with the MessageDTO and posts the content", async () => {
    fetchMock.mockResolvedValue(res(201, MESSAGE));
    expect(await sendMessage("c1", "Cześć")).toEqual({
      ok: true,
      data: MESSAGE,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/communities/c1/messages",
      { content: "Cześć" },
    );
  });

  it("403 → forbidden; 400 → validation (empty); 429 → rateLimited", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await sendMessage("c1", "x")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });
    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await sendMessage("c1", "  ")).toEqual({
      ok: false,
      error: { kind: "validation" },
    });
    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 9 }));
    expect(await sendMessage("c1", "x")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 9 },
    });
  });
});

describe("chat API client — deleteMessage / reportMessage", () => {
  it("deleteMessage 200 → ok and issues DELETE", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await deleteMessage("m1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "DELETE",
      "/api/v1/messages/m1",
      undefined,
    );
  });

  it("deleteMessage 403 → forbidden; 404 → notFound", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await deleteMessage("m1")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await deleteMessage("m1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
  });

  it("reportMessage 201 → ok and posts the reason; 404 → notFound", async () => {
    fetchMock.mockResolvedValue(res(201, { ok: true }));
    expect(await reportMessage("m1", "spam")).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/messages/m1/report",
      { reason: "spam" },
    );

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await reportMessage("m1", "x")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
  });
});
