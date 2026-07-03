jest.mock("@/lib/api/events", () => ({
  getEvent: jest.fn(),
  setRsvp: jest.fn(),
  reportEvent: jest.fn(),
  cancelEvent: jest.fn(),
}));

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useEvent } from "@/hooks/useEvent";
import { getEvent, setRsvp, reportEvent, cancelEvent } from "@/lib/api/events";
import { strings } from "@/i18n";
import type { EventDTO, RsvpStatus } from "@shared/types";

const getMock = getEvent as unknown as jest.Mock;
const rsvpMock = setRsvp as unknown as jest.Mock;
const reportMock = reportEvent as unknown as jest.Mock;
const cancelMock = cancelEvent as unknown as jest.Mock;

const event = (over: Partial<EventDTO> = {}): EventDTO => ({
  id: "e1",
  communityId: "c1",
  title: "Spotkanie",
  description: "Opis",
  location: "Warszawa",
  startsAt: "2026-07-01T16:00:00.000Z",
  endsAt: "2026-07-01T18:00:00.000Z",
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 5,
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
  ...over,
});

beforeEach(() => {
  getMock.mockReset();
  rsvpMock.mockReset();
  reportMock.mockReset();
  cancelMock.mockReset();
});

describe("useEvent", () => {
  it("loads the event → ready", async () => {
    getMock.mockResolvedValue({ ok: true, data: event() });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.event?.id).toBe("e1");
    expect(getMock).toHaveBeenCalledWith("e1");
  });

  it("error → retry re-fetches", async () => {
    getMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    getMock.mockResolvedValueOnce({ ok: true, data: event() });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("RSVP none→going patches rsvp and increments goingCount", async () => {
    getMock.mockResolvedValue({ ok: true, data: event({ goingCount: 5 }) });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rsvpMock.mockResolvedValueOnce({ ok: true, data: { status: "going" } });
    await act(async () => {
      await result.current.setRsvp("going");
    });
    expect(result.current.event?.rsvp).toEqual({ status: "going" });
    expect(result.current.event?.goingCount).toBe(6);
  });

  it("RSVP going→interested decrements goingCount", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: event({ goingCount: 5, rsvp: { status: "going" } }),
    });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rsvpMock.mockResolvedValueOnce({
      ok: true,
      data: { status: "interested" as RsvpStatus },
    });
    await act(async () => {
      await result.current.setRsvp("interested");
    });
    expect(result.current.event?.rsvp).toEqual({ status: "interested" });
    expect(result.current.event?.goingCount).toBe(4);
  });

  it("RSVP interested→not_going leaves goingCount unchanged", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: event({ goingCount: 4, rsvp: { status: "interested" } }),
    });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rsvpMock.mockResolvedValueOnce({
      ok: true,
      data: { status: "not_going" as RsvpStatus },
    });
    await act(async () => {
      await result.current.setRsvp("not_going");
    });
    expect(result.current.event?.rsvp).toEqual({ status: "not_going" });
    expect(result.current.event?.goingCount).toBe(4);
  });

  it("RSVP failure → message, state unchanged", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: event({ goingCount: 5, rsvp: null }),
    });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rsvpMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "forbidden" },
    });
    let outcome: { ok: boolean } = { ok: true };
    await act(async () => {
      outcome = await result.current.setRsvp("going");
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.event?.rsvp).toBeNull();
    expect(result.current.event?.goingCount).toBe(5);
  });

  it("report success → { ok: true } and posts the reason", async () => {
    getMock.mockResolvedValue({ ok: true, data: event() });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    reportMock.mockResolvedValueOnce({ ok: true, data: { ok: true } });
    let outcome: { ok: boolean } = { ok: false };
    await act(async () => {
      outcome = await result.current.report("spam");
    });
    expect(outcome).toEqual({ ok: true });
    expect(reportMock).toHaveBeenCalledWith("e1", "spam");
  });

  it("report failure → { ok: false, message } (mapped)", async () => {
    getMock.mockResolvedValue({ ok: true, data: event() });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    reportMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "notFound" },
    });
    let outcome: { ok: boolean; message?: string } = { ok: true };
    await act(async () => {
      outcome = await result.current.report("spam");
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toEqual(expect.any(String));
  });

  it("cancel success → patches status to cancelled, canCancel off", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: event({ canCancel: true }),
    });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    cancelMock.mockResolvedValueOnce({ ok: true, data: { ok: true } });
    let outcome: { ok: boolean } = { ok: false };
    await act(async () => {
      outcome = await result.current.cancel();
    });
    expect(outcome).toEqual({ ok: true });
    expect(cancelMock).toHaveBeenCalledWith("e1");
    expect(result.current.event?.status).toBe("cancelled");
    expect(result.current.event?.canCancel).toBe(false);
    expect(result.current.event?.cancelledAt).toEqual(expect.any(String));
  });

  it("cancel failure → cancel-specific copy (403 ≠ RSVP copy), state unchanged", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: event({ canCancel: true }),
    });
    const { result } = renderHook(() => useEvent("e1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // 403 → "you can't cancel this", NOT the RSVP "join the community" copy.
    cancelMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "forbidden" },
    });
    let outcome: { ok: boolean; message?: string } = { ok: true };
    await act(async () => {
      outcome = await result.current.cancel();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(strings.events.cancelForbidden);
    expect(outcome.message).not.toBe(strings.events.rsvpForbidden);
    // state unchanged: still active + still cancellable
    expect(result.current.event?.status).toBe("active");
    expect(result.current.event?.canCancel).toBe(true);

    // 404 → event no longer available
    cancelMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "notFound" },
    });
    await act(async () => {
      outcome = await result.current.cancel();
    });
    expect(outcome.message).toBe(strings.events.notAvailable);

    // 409 → already cancelled or past
    cancelMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "conflict" },
    });
    await act(async () => {
      outcome = await result.current.cancel();
    });
    expect(outcome.message).toBe(strings.events.rsvpUnavailable);
  });
});
