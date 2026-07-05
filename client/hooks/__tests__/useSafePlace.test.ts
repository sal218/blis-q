jest.mock("@/lib/api/safePlaces", () => ({
  getSafePlace: jest.fn(),
  saveSafePlace: jest.fn(),
  unsaveSafePlace: jest.fn(),
  reportSafePlace: jest.fn(),
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
import { useSafePlace } from "@/hooks/useSafePlace";
import {
  getSafePlace,
  saveSafePlace,
  unsaveSafePlace,
  reportSafePlace,
} from "@/lib/api/safePlaces";
import type { SafePlaceDTO } from "@shared/types";

const getMock = getSafePlace as unknown as jest.Mock;
const saveMock = saveSafePlace as unknown as jest.Mock;
const unsaveMock = unsaveSafePlace as unknown as jest.Mock;
const reportMock = reportSafePlace as unknown as jest.Mock;

const place = (over: Partial<SafePlaceDTO> = {}): SafePlaceDTO => ({
  id: "p1",
  name: "Tęczowa Kawiarnia",
  category: "cafe",
  description: "Miłe miejsce",
  address: null,
  city: "Warszawa",
  latitude: null,
  longitude: null,
  imageUrl: null,
  saved: false,
  ...over,
});

const ok = (p: SafePlaceDTO) => ({ ok: true as const, data: p });

beforeEach(() => {
  getMock.mockReset();
  saveMock.mockReset();
  unsaveMock.mockReset();
  reportMock.mockReset();
});

describe("useSafePlace", () => {
  it("loads on focus → ready", async () => {
    getMock.mockResolvedValue(ok(place()));
    const { result } = renderHook(() => useSafePlace("p1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.place?.name).toBe("Tęczowa Kawiarnia");
    expect(getMock).toHaveBeenCalledWith("p1");
  });

  it("error state + retry reloads", async () => {
    getMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSafePlace("p1"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    getMock.mockResolvedValueOnce(ok(place()));
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("toggleSave flips optimistically, then persists", async () => {
    getMock.mockResolvedValue(ok(place({ saved: false })));
    saveMock.mockResolvedValue({ ok: true, data: { ok: true } });
    const { result } = renderHook(() => useSafePlace("p1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.toggleSave();
    });
    expect(result.current.place?.saved).toBe(true);
    expect(saveMock).toHaveBeenCalledWith("p1");
  });

  it("toggleSave reverts on failure", async () => {
    getMock.mockResolvedValue(ok(place({ saved: false })));
    saveMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSafePlace("p1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.toggleSave();
    });
    await waitFor(() => expect(result.current.place?.saved).toBe(false));
  });

  it("report returns ok on success and a message on failure", async () => {
    getMock.mockResolvedValue(ok(place()));
    const { result } = renderHook(() => useSafePlace("p1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    reportMock.mockResolvedValueOnce({ ok: true, data: { ok: true } });
    await act(async () => {
      expect(await result.current.report("spam")).toEqual({ ok: true });
    });
    expect(reportMock).toHaveBeenCalledWith("p1", "spam");

    reportMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      const outcome = await result.current.report("spam");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(typeof outcome.message).toBe("string");
    });
  });
});
