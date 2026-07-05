jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useJoinedCommunities } from "@/hooks/useJoinedCommunities";
import { listCommunities } from "@/lib/api/communities";
import type { CommunityDTO } from "@shared/types";

const listMock = listCommunities as unknown as jest.Mock;

type Membership = { role: "member" | "moderator" | "admin" } | null;

const community = (
  id: string,
  membership: Membership = null,
): CommunityDTO => ({
  id,
  name: id,
  description: null,
  imageUrl: null,
  memberCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  membership,
});

const page = (
  items: CommunityDTO[],
  { page = 1, totalPages = 1 } = {},
): { ok: true; data: unknown } => ({
  ok: true,
  data: { data: items, page, pageSize: 20, total: items.length, totalPages },
});

beforeEach(() => listMock.mockReset());

describe("useJoinedCommunities", () => {
  it("does not fetch while disabled", async () => {
    const { result } = renderHook(() => useJoinedCommunities(false));
    // Give any (unwanted) effect a tick.
    await act(async () => {});
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("loading");
    expect(result.current.communities).toEqual([]);
  });

  it("accumulates joined communities across ALL pages (not just page 1)", async () => {
    listMock.mockImplementation(async ({ page: p }: { page: number }) =>
      p === 1
        ? page([community("a", { role: "member" }), community("b")], {
            page: 1,
            totalPages: 2,
          })
        : page([community("c", { role: "admin" })], { page: 2, totalPages: 2 }),
    );

    const { result } = renderHook(() => useJoinedCommunities(true));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // "a" (member) + "c" (admin) are joined; "b" (no membership) is excluded.
    expect(result.current.communities.map((c) => c.id)).toEqual(["a", "c"]);
    expect(listMock).toHaveBeenCalledTimes(2); // paged to exhaustion
  });

  it("surfaces an error when a page load fails", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "network" } });
    const { result } = renderHook(() => useJoinedCommunities(true));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("does not apply a load that resolves after the hook is disabled", async () => {
    let resolvePage: ((v: unknown) => void) | undefined;
    listMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useJoinedCommunities(enabled),
      { initialProps: { enabled: true } },
    );

    // Disable before the in-flight page resolves.
    rerender({ enabled: false });
    await act(async () => {
      resolvePage?.(page([community("late", { role: "member" })]));
    });

    // The stale result must NOT populate the list.
    expect(result.current.communities).toEqual([]);
  });
});
