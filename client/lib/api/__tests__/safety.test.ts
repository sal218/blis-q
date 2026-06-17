// Mock the network boundary; assert the status→BlocksResult mapping only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import { listBlocks, unblockUser } from "@/lib/api/safety";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const BLOCKS = [
  { id: "u1", displayName: "Alex", avatarUrl: null },
  { id: "u2", displayName: "Marta", avatarUrl: null },
];

beforeEach(() => fetchMock.mockReset());

describe("safety (blocks) API client mapping", () => {
  it("listBlocks 200 → PublicUser[]", async () => {
    fetchMock.mockResolvedValue(res(200, BLOCKS));
    const result = await listBlocks();
    expect(result).toEqual({ ok: true, data: BLOCKS });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/blocks", undefined);
  });

  it("unblockUser 200 → ok, hits the user-scoped path", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const result = await unblockUser("u1");
    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "DELETE",
      "/api/v1/blocks/u1",
      undefined,
    );
  });

  it("5xx → server", async () => {
    fetchMock.mockResolvedValue(res(500, { error: "Internal Server Error" }));
    const result = await listBlocks();
    expect(result).toEqual({ ok: false, error: { kind: "server" } });
  });

  it("fetch throwing → network", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await unblockUser("u1");
    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
});
