jest.mock("@/lib/api/news", () => ({ listNews: jest.fn() }));

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
import { useHomeNews } from "@/hooks/useHomeNews";
import { listNews } from "@/lib/api/news";
import { railRetryDelay } from "@/hooks/homeRailRetry";
import type { NewsDTO } from "@shared/types";

const listMock = listNews as unknown as jest.Mock;
const delayMock = railRetryDelay as unknown as jest.Mock;

const article = (id: string): NewsDTO => ({
  id,
  title: id,
  summary: "…",
  body: null,
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: false,
  createdAt: "2026-06-01T00:00:00.000Z",
});
const page = (data: NewsDTO[]) => ({
  ok: true as const,
  data: { data, page: 1, pageSize: 25, total: data.length, totalPages: 1 },
});
const ids = (ns: NewsDTO[]) => ns.map((n) => n.id);

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useHomeNews", () => {
  it("loads on focus → ready with the news", async () => {
    listMock.mockResolvedValue(page([article("n1")]));
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.news)).toEqual(["n1"]);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("auto-retries a transient failure once, then recovers → ready", async () => {
    listMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "server" } })
      .mockResolvedValueOnce(page([article("n1")]));
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.news)).toEqual(["n1"]);
    expect(listMock).toHaveBeenCalledTimes(2); // initial + one auto-retry
  });

  it("surfaces an error after the auto-retry also fails", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(2); // retried exactly once
  });

  it("does NOT auto-retry a non-transient failure (surfaces immediately)", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "validation" } });
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(listMock).toHaveBeenCalledTimes(1); // no retry
  });

  it("retry re-loads after a failure → ready", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValue(page([article("n1")]));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.news)).toEqual(["n1"]);
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
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("loading"); // waiting on the retry delay

    // A newer focus resolves with fresh data while the delay is still pending.
    listMock.mockResolvedValueOnce(page([article("fresh")]));
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() => expect(ids(result.current.news)).toEqual(["fresh"]));
    const callsBeforeDelay = listMock.mock.calls.length; // initial + newer = 2

    // The stale delay resolves LATE — its seq is superseded, so it must NOT issue
    // a retry fetch or overwrite the fresher result.
    await act(async () => {
      resolveDelay();
    });
    expect(listMock).toHaveBeenCalledTimes(callsBeforeDelay); // no retry fetch
    expect(ids(result.current.news)).toEqual(["fresh"]);
    expect(result.current.status).toBe("ready");
  });

  it("a silent re-focus failure keeps the existing list (no retry, stays ready)", async () => {
    listMock.mockResolvedValue(page([article("n1")]));
    const { result } = renderHook(() => useHomeNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const callsAfterLoad = listMock.mock.calls.length;

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.status).toBe("ready");
    expect(ids(result.current.news)).toEqual(["n1"]);
    // silent failure → exactly one more call, NOT retried
    expect(listMock).toHaveBeenCalledTimes(callsAfterLoad + 1);
  });
});
