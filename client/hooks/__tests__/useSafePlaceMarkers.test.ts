jest.mock("@/lib/api/safePlaces", () => ({
  listSafePlaceMarkers: jest.fn(),
}));

jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useFocusEffect: (cb: () => void) => {
      React.useEffect(cb, [cb]);
    },
  };
});

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useSafePlaceMarkers } from "@/hooks/useSafePlaceMarkers";
import { listSafePlaceMarkers } from "@/lib/api/safePlaces";
import type { SafePlaceMarkerDTO } from "@shared/types";

const listMock = listSafePlaceMarkers as unknown as jest.Mock;

const MARKERS: SafePlaceMarkerDTO[] = [
  { id: "s1", name: "A", category: "cafe", latitude: 52.2, longitude: 21.0 },
];

beforeEach(() => listMock.mockReset());

describe("useSafePlaceMarkers", () => {
  it("loads markers on focus → ready", async () => {
    listMock.mockResolvedValue({ ok: true, data: MARKERS });
    const { result } = renderHook(() => useSafePlaceMarkers());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.markers).toEqual(MARKERS);
    expect(listMock).toHaveBeenCalledWith({
      category: undefined,
      city: undefined,
      search: undefined,
    });
  });

  it("a failed fetch → error, and retry re-loads → ready", async () => {
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSafePlaceMarkers());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.markers).toEqual([]);

    listMock.mockResolvedValueOnce({ ok: true, data: MARKERS });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.markers).toEqual(MARKERS);
  });
});
