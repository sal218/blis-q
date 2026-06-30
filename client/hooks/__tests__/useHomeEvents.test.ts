jest.mock("@/lib/api/events", () => ({ listMyEvents: jest.fn() }));

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
import { useHomeEvents } from "@/hooks/useHomeEvents";
import { listMyEvents } from "@/lib/api/events";
import type { EventDTO } from "@shared/types";

const listMock = listMyEvents as unknown as jest.Mock;

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
  goingCount: 1,
  rsvp: { status: "going" },
  deleted: false,
});

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useHomeEvents", () => {
  it("loads on focus → ready with the events", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("a later focus refetches and updates the list", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: true, data: [ev("e2")] });
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("e2")]));
  });

  it("drops a stale refetch that resolves after a newer focus", async () => {
    listMock.mockResolvedValueOnce({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
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
    listMock.mockResolvedValueOnce({ ok: true, data: [ev("e2")] });
    await act(async () => {
      mockFocusCb?.(); // B resolves → e2 wins
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("e2")]));

    // A resolves late — it must NOT overwrite the fresher e2.
    await act(async () => {
      resolveA({ ok: true, data: [ev("e1")] });
    });
    expect(result.current.events).toEqual([ev("e2")]);
  });

  it("a silent re-focus failure keeps the existing list (status stays ready)", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([ev("e1")]);
  });
});
