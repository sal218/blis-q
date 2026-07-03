jest.mock("@/lib/api/events", () => ({ listSavedEvents: jest.fn() }));

// Capture the focus callback so a test can simulate returning to the screen.
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
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { listSavedEvents } from "@/lib/api/events";
import type { EventDTO } from "@shared/types";

const listMock = listSavedEvents as unknown as jest.Mock;

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
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: true,
  category: null,
});

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useSavedEvents", () => {
  it("loads on focus → ready with the saved events", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1")] });
    const { result } = renderHook(() => useSavedEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
  });

  it("surfaces an error state on initial failure; retry re-fetches", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSavedEvents());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValueOnce({ ok: true, data: [ev("e1")] });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.events).toEqual([ev("e1")]);
  });

  it("a later focus silently refetches (e.g. after an unsave) and updates", async () => {
    listMock.mockResolvedValue({ ok: true, data: [ev("e1"), ev("e2")] });
    const { result } = renderHook(() => useSavedEvents());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: true, data: [ev("e1")] }); // e2 unsaved
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() => expect(result.current.events).toEqual([ev("e1")]));
  });
});
