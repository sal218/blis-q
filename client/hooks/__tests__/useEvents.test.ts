jest.mock("@/lib/api/events", () => ({ listEvents: jest.fn() }));

// Capture the focus callback so a test can simulate returning to the feed.
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
import { useEvents } from "@/hooks/useEvents";
import { listEvents } from "@/lib/api/events";
import type { EventDTO } from "@shared/types";

const listMock = listEvents as unknown as jest.Mock;

const ev = (id: string): EventDTO => ({
  id,
  communityId: "c1",
  title: id,
  description: null,
  location: null,
  startsAt: "2026-07-01T16:00:00.000Z",
  endsAt: null,
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 0,
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
});

const page = (events: EventDTO[], nextCursor: string | null) => ({
  ok: true as const,
  data: { data: events, nextCursor },
});

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useEvents", () => {
  it("loads on focus → ready with the events", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toEqual(expect.any(String));
  });

  // Returning to the feed must refetch WITHOUT the pull-to-refresh spinner.
  it("re-focus refetches silently — no spinner in flight, updates on resolve", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let resolveRefetch!: (v: unknown) => void;
    listMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveRefetch = r;
      }),
    );
    act(() => {
      mockFocusCb?.(); // back to the feed; silent refetch now in flight
    });

    expect(result.current.refreshing).toBe(false);
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([ev("e1")]);

    await act(async () => {
      resolveRefetch(page([ev("e2")], null));
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("e2")]));
    expect(result.current.refreshing).toBe(false);
  });

  it("a silent re-focus failure keeps the existing list", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([ev("e1")]);
    expect(result.current.errorMessage).toBeNull();
  });

  it("load-more appends the next page and advances the cursor", async () => {
    listMock.mockResolvedValueOnce(page([ev("e1")], "cursor-2"));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(page([ev("e2")], null));
    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() =>
      expect(result.current.events).toEqual([ev("e1"), ev("e2")]),
    );
    // second call carried the page-1 cursor
    expect(listMock).toHaveBeenLastCalledWith("cursor-2");
  });

  it("load-more is a no-op when there is no next cursor", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.loadMore();
    });
    expect(listMock).toHaveBeenCalledTimes(1); // no extra fetch
  });

  // A slow load-more that resolves AFTER a refresh must be dropped (stale guard).
  it("drops a stale load-more that resolves after a refresh", async () => {
    listMock.mockResolvedValueOnce(page([ev("e1")], "cursor-2")); // initial
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let resolveMore!: (v: unknown) => void;
    listMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveMore = r;
      }),
    ); // load-more (in flight)
    act(() => {
      result.current.loadMore();
    });

    listMock.mockResolvedValueOnce(page([ev("e9")], null)); // refresh wins
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("e9")]));

    // the stale load-more now resolves — it must NOT append onto the refresh
    await act(async () => {
      resolveMore(page([ev("e1b")], null));
    });
    expect(result.current.events).toEqual([ev("e9")]);
  });
});
