jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));

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
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { listCommunities } from "@/lib/api/communities";
import { railRetryDelay } from "@/hooks/homeRailRetry";
import type { CommunityDTO } from "@shared/types";

const listMock = listCommunities as unknown as jest.Mock;
const delayMock = railRetryDelay as unknown as jest.Mock;

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

  it("auto-retries a transient failure once, then recovers → ready", async () => {
    listMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "server" } })
      .mockResolvedValueOnce(page([comm("joined", true)]));
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.communities)).toEqual(["joined"]);
    expect(listMock).toHaveBeenCalledTimes(2); // initial + one auto-retry
  });

  it("surfaces an error after the auto-retry also fails", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(2); // retried exactly once
  });

  it("does NOT auto-retry a non-transient failure (surfaces immediately)", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "validation" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(1); // no retry
  });

  it("retry re-loads after a failure → ready", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValue(page([comm("joined", true)]));
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

  it("a newer load during the retry delay supersedes the stale auto-retry", async () => {
    // Initial load fails transiently → schedules a retry behind a DEFERRED delay.
    let resolveDelay!: () => void;
    delayMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolveDelay = () => r();
      }),
    );
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("loading"); // waiting on the retry delay

    // A newer focus resolves with fresh data while the delay is still pending.
    listMock.mockResolvedValueOnce(page([comm("fresh", true)]));
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() =>
      expect(ids(result.current.communities)).toEqual(["fresh"]),
    );
    const callsBeforeDelay = listMock.mock.calls.length; // initial + newer = 2

    // The stale delay resolves LATE — its seq is superseded, so it must NOT issue
    // a retry fetch or overwrite the fresher result.
    await act(async () => {
      resolveDelay();
    });
    expect(listMock).toHaveBeenCalledTimes(callsBeforeDelay); // no retry fetch
    expect(ids(result.current.communities)).toEqual(["fresh"]);
    expect(result.current.status).toBe("ready");
  });

  it("a silent re-focus failure keeps the existing list (no retry, stays ready)", async () => {
    listMock.mockResolvedValue(page([comm("a", true)]));
    const { result } = renderHook(() => useHomeCommunities());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const callsAfterLoad = listMock.mock.calls.length;

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.status).toBe("ready");
    expect(ids(result.current.communities)).toEqual(["a"]);
    // silent failure → exactly one more call, NOT retried
    expect(listMock).toHaveBeenCalledTimes(callsAfterLoad + 1);
  });
});
