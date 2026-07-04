jest.mock("@/lib/api/events", () => ({
  listEvents: jest.fn(),
  saveEvent: jest.fn(),
  unsaveEvent: jest.fn(),
}));

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
import { listEvents, saveEvent, unsaveEvent } from "@/lib/api/events";
import type { EventDTO } from "@shared/types";

const listMock = listEvents as unknown as jest.Mock;
const saveMock = saveEvent as unknown as jest.Mock;
const unsaveMock = unsaveEvent as unknown as jest.Mock;

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
  category: null,
});

const page = (events: EventDTO[], nextCursor: string | null) => ({
  ok: true as const,
  data: { data: events, nextCursor },
});

beforeEach(() => {
  listMock.mockReset();
  saveMock.mockReset();
  unsaveMock.mockReset();
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
    // second call carried the page-1 cursor (+ no active category filter)
    expect(listMock).toHaveBeenLastCalledWith("cursor-2", undefined);
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

  // ── category filter (slice D2) ──────────────────────────────────────────────

  it("setCategory refetches with the category and replaces the list", async () => {
    listMock.mockResolvedValueOnce(page([ev("e1")], null)); // initial (all)
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.category).toBeNull();

    listMock.mockResolvedValueOnce(page([ev("s1")], null)); // support page
    await act(async () => {
      result.current.setCategory("support");
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("s1")]));
    expect(result.current.category).toBe("support");
    // the refetch carried the category (replace mode → no cursor)
    expect(listMock).toHaveBeenLastCalledWith(undefined, "support");
  });

  it("load-more within a category carries the active category", async () => {
    listMock.mockResolvedValueOnce(page([ev("e1")], null)); // initial (all)
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(page([ev("s1")], "cur2")); // support p1
    await act(async () => {
      result.current.setCategory("support");
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("s1")]));

    listMock.mockResolvedValueOnce(page([ev("s2")], null)); // support p2
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.events).toEqual([ev("s1"), ev("s2")]),
    );
    expect(listMock).toHaveBeenLastCalledWith("cur2", "support");
  });

  it("clearing the category refetches the unfiltered feed", async () => {
    listMock.mockResolvedValueOnce(page([ev("e1")], null)); // all
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(page([ev("s1")], null)); // support
    await act(async () => {
      result.current.setCategory("support");
    });
    await waitFor(() => expect(result.current.category).toBe("support"));

    listMock.mockResolvedValueOnce(page([ev("e1")], null)); // back to all
    await act(async () => {
      result.current.setCategory(null);
    });
    await waitFor(() => expect(result.current.category).toBeNull());
    expect(listMock).toHaveBeenLastCalledWith(undefined, undefined);
  });

  it("setCategory to the current value is a no-op (no refetch)", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const before = listMock.mock.calls.length;
    await act(async () => {
      result.current.setCategory(null); // already null
    });
    expect(listMock.mock.calls.length).toBe(before);
  });

  // ── card save toggle (feed bookmark) ────────────────────────────────────────

  it("toggleSave optimistically flips saved and calls saveEvent", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null)); // saved:false
    saveMock.mockResolvedValue({ ok: true, data: { ok: true } });
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.toggleSave("e1");
    });
    expect(saveMock).toHaveBeenCalledWith("e1");
    expect(unsaveMock).not.toHaveBeenCalled();
    expect(result.current.events[0].saved).toBe(true);
  });

  it("toggleSave on an already-saved event calls unsaveEvent", async () => {
    listMock.mockResolvedValue(page([{ ...ev("e1"), saved: true }], null));
    unsaveMock.mockResolvedValue({ ok: true, data: { ok: true } });
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.toggleSave("e1");
    });
    expect(unsaveMock).toHaveBeenCalledWith("e1");
    expect(result.current.events[0].saved).toBe(false);
  });

  it("toggleSave reverts the flip when the request fails", async () => {
    listMock.mockResolvedValue(page([ev("e1")], null)); // saved:false
    saveMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.toggleSave("e1");
    });
    expect(result.current.events[0].saved).toBe(false); // reverted
  });

  it("toggleSave only touches the targeted card, not its siblings", async () => {
    listMock.mockResolvedValue(page([ev("e1"), ev("e2")], null));
    saveMock.mockResolvedValue({ ok: true, data: { ok: true } });
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.toggleSave("e2");
    });
    expect(result.current.events[0].saved).toBe(false); // e1 untouched
    expect(result.current.events[1].saved).toBe(true); // e2 flipped
  });
});
