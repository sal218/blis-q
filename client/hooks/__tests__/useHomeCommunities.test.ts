jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));

// Capture the focus callback so a test can simulate returning to the Home tab.
let mockFocusCb: (() => void) | undefined;
jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocusCb = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { listCommunities } from "@/lib/api/communities";
import type { CommunityDTO } from "@shared/types";

const listMock = listCommunities as unknown as jest.Mock;

const comm = (id: string, joined: boolean): CommunityDTO => ({
  id,
  name: id,
  description: null,
  imageUrl: null,
  memberCount: 3,
  createdAt: "2026-06-01T00:00:00.000Z",
  membership: joined ? { role: "member" } : null,
});
const page = (data: CommunityDTO[]) => ({
  ok: true as const,
  data: { data, page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});
const ids = (cs: CommunityDTO[]) => cs.map((c) => c.id);

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useHomeCommunities", () => {
  it("loads on focus → ready, filtering to JOINED communities", async () => {
    listMock.mockResolvedValue(
      page([comm("joined", true), comm("notjoined", false)]),
    );
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.communities)).toEqual(["joined"]);
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("retry re-loads after a failure → ready", async () => {
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValueOnce(page([comm("joined", true)]));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.communities)).toEqual(["joined"]);
  });

  it("drops a stale refetch that resolves after a newer focus", async () => {
    listMock.mockResolvedValueOnce(page([comm("a", true)]));
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Refetch A is in flight (deferred) when a newer refetch B resolves first.
    let resolveA!: (v: unknown) => void;
    listMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveA = r;
      }),
    );
    act(() => {
      mockFocusCb?.(); // A in flight
    });
    listMock.mockResolvedValueOnce(page([comm("b", true)]));
    await act(async () => {
      mockFocusCb?.(); // B resolves → b wins
    });
    await waitFor(() => expect(ids(result.current.communities)).toEqual(["b"]));

    // A resolves late — it must NOT overwrite the fresher b.
    await act(async () => {
      resolveA(page([comm("a", true)]));
    });
    expect(ids(result.current.communities)).toEqual(["b"]);
  });

  it("a silent re-focus failure keeps the existing list (status stays ready)", async () => {
    listMock.mockResolvedValue(page([comm("a", true)]));
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.status).toBe("ready");
    expect(ids(result.current.communities)).toEqual(["a"]);
  });
});
