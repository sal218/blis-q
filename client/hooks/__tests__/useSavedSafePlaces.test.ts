jest.mock("@/lib/api/safePlaces", () => ({
  listSavedSafePlaces: jest.fn(),
  unsaveSafePlace: jest.fn(),
}));

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
import { useSavedSafePlaces } from "@/hooks/useSavedSafePlaces";
import { listSavedSafePlaces, unsaveSafePlace } from "@/lib/api/safePlaces";
import type { SafePlaceDTO } from "@shared/types";

const listMock = listSavedSafePlaces as unknown as jest.Mock;
const unsaveMock = unsaveSafePlace as unknown as jest.Mock;

const place = (id: string): SafePlaceDTO => ({
  id,
  name: id,
  category: "cafe",
  description: null,
  address: null,
  city: "Warszawa",
  latitude: null,
  longitude: null,
  imageUrl: null,
  saved: true,
});

const ok = (ids: string[]) => ({ ok: true as const, data: ids.map(place) });

beforeEach(() => {
  listMock.mockReset();
  unsaveMock.mockReset();
  mockFocusCb = undefined;
});

describe("useSavedSafePlaces", () => {
  it("loads on focus → ready with the saved places", async () => {
    listMock.mockResolvedValue(ok(["s1", "s2"]));
    const { result } = renderHook(() => useSavedSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.places.map((p) => p.id)).toEqual(["s1", "s2"]);
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSavedSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("re-focus refetches silently", async () => {
    listMock.mockResolvedValueOnce(ok(["s1"]));
    const { result } = renderHook(() => useSavedSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(ok(["s1", "s3"]));
    await act(async () => {
      mockFocusCb?.();
    });
    await waitFor(() =>
      expect(result.current.places.map((p) => p.id)).toEqual(["s1", "s3"]),
    );
  });

  it("toggleSave removes the row optimistically (unsave)", async () => {
    listMock.mockResolvedValue(ok(["s1", "s2"]));
    unsaveMock.mockResolvedValue({ ok: true, data: { ok: true } });
    const { result } = renderHook(() => useSavedSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.toggleSave(result.current.places[0]);
    });
    expect(result.current.places.map((p) => p.id)).toEqual(["s2"]);
    expect(unsaveMock).toHaveBeenCalledWith("s1");
  });

  it("toggleSave restores the row at its index when unsave fails", async () => {
    listMock.mockResolvedValue(ok(["s1", "s2"]));
    unsaveMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSavedSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.toggleSave(result.current.places[0]);
    });
    await waitFor(() =>
      expect(result.current.places.map((p) => p.id)).toEqual(["s1", "s2"]),
    );
  });
});
