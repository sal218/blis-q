jest.mock("@/lib/api/events", () => ({ listMyEvents: jest.fn() }));

// Stub only the retry DELAY so the auto-retry runs synchronously in tests; the
// transient-vs-not decision (isTransientRailError) stays REAL so we exercise it.
jest.mock("@/hooks/homeRailRetry", () => {
  const actual = jest.requireActual("@/hooks/homeRailRetry");
  return { ...actual, railRetryDelay: jest.fn(() => Promise.resolve()) };
});

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
import { railRetryDelay } from "@/hooks/homeRailRetry";
import type { EventDTO } from "@shared/types";

const listMock = listMyEvents as unknown as jest.Mock;
const delayMock = railRetryDelay as unknown as jest.Mock;

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
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
  category: null,
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

  it("auto-retries a transient failure once, then recovers → ready", async () => {
    listMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "server" } })
      .mockResolvedValueOnce({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
    expect(listMock).toHaveBeenCalledTimes(2); // initial + one auto-retry
  });

  it("surfaces an error after the auto-retry also fails", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(2); // retried exactly once
  });

  it("does NOT auto-retry a non-transient failure (surfaces immediately)", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "validation" } });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(1); // no retry
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

  it("a newer load during the retry delay supersedes the stale auto-retry", async () => {
    // Initial load fails transiently → schedules a retry behind a DEFERRED delay.
    let resolveDelay!: () => void;
    delayMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolveDelay = () => r();
      }),
    );
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("loading"); // waiting on the retry delay

    // A newer focus resolves with fresh data while the delay is still pending.
    listMock.mockResolvedValueOnce({ ok: true, data: [ev("fresh")] });
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("fresh")]));
    const callsBeforeDelay = listMock.mock.calls.length; // initial + newer = 2

    // The stale delay resolves LATE — its seq is superseded, so it must NOT issue
    // a retry fetch or overwrite the fresher result.
    await act(async () => {
      resolveDelay();
    });
    expect(listMock).toHaveBeenCalledTimes(callsBeforeDelay); // no retry fetch
    expect(result.current.events).toEqual([ev("fresh")]);
    expect(result.current.status).toBe("ready");
  });

  it("a silent re-focus failure keeps the existing list (no retry, stays ready)", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const callsAfterLoad = listMock.mock.calls.length;

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([ev("e1")]);
    // silent failure → exactly one more call, NOT retried
    expect(listMock).toHaveBeenCalledTimes(callsAfterLoad + 1);
  });

  it("retry re-loads after a failure → ready", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
  });
});
