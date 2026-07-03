// Mock the network boundary; assert the status→EventsResult mapping, the cursor
// query-string, and the RSVP body only.
jest.mock("@/lib/auth", () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from "@/lib/auth";
import {
  listEvents,
  listMyEvents,
  getEvent,
  setRsvp,
  createEvent,
  reportEvent,
  cancelEvent,
  saveEvent,
  unsaveEvent,
  listSavedEvents,
} from "@/lib/api/events";

const fetchMock = fetchWithAuth as unknown as jest.Mock;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const EVENT = {
  id: "e1",
  communityId: "c1",
  title: "Spotkanie",
  description: null,
  location: "Warszawa",
  startsAt: "2026-07-01T16:00:00.000Z",
  endsAt: "2026-07-01T18:00:00.000Z",
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 3,
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
  category: null,
};
const PAGE = { data: [EVENT], nextCursor: "cursor-2" };

beforeEach(() => fetchMock.mockReset());

describe("events API client — listEvents", () => {
  it("200 → ok with the cursor page; no cursor in the query on page 1", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    expect(await listEvents()).toEqual({ ok: true, data: PAGE });
    expect(fetchMock).toHaveBeenCalledWith("GET", "/api/v1/events", undefined);
  });

  it("appends the (encoded) cursor when paginating", async () => {
    fetchMock.mockResolvedValue(res(200, { data: [], nextCursor: null }));
    await listEvents("a b/c");
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events?cursor=a%20b%2Fc",
      undefined,
    );
  });

  it("appends ?category= when filtering (no cursor)", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listEvents(undefined, "support");
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events?category=support",
      undefined,
    );
  });

  it("composes BOTH cursor and category (cursor within a category)", async () => {
    fetchMock.mockResolvedValue(res(200, PAGE));
    await listEvents("cur", "culture");
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events?cursor=cur&category=culture",
      undefined,
    );
  });

  it("404 → notFound; 400 → validation; 429 → rateLimited(retryAfter); 5xx → server", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await listEvents()).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await listEvents()).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 30 }));
    expect(await listEvents()).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listEvents()).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });

  it("fetch throwing → network", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listEvents()).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("events API client — listMyEvents", () => {
  it("200 → ok with the bare event array at /events/mine", async () => {
    fetchMock.mockResolvedValue(res(200, [EVENT]));
    expect(await listMyEvents()).toEqual({ ok: true, data: [EVENT] });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events/mine",
      undefined,
    );
  });

  it("5xx → server; network", async () => {
    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listMyEvents()).toEqual({
      ok: false,
      error: { kind: "server" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listMyEvents()).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("events API client — reportEvent", () => {
  it("201 → ok and posts the reason to the report path", async () => {
    fetchMock.mockResolvedValue(res(201, { ok: true }));
    expect(await reportEvent("e1", "spam")).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith("POST", "/api/v1/events/e1/report", {
      reason: "spam",
    });
  });

  it("404 → notFound (event no longer visible); 429 → rateLimited; network", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await reportEvent("e1", "x")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 20 }));
    expect(await reportEvent("e1", "x")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 20 },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await reportEvent("e1", "x")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("events API client — getEvent", () => {
  it("200 → ok with the EventDTO at the right path", async () => {
    fetchMock.mockResolvedValue(res(200, EVENT));
    expect(await getEvent("e1")).toEqual({ ok: true, data: EVENT });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events/e1",
      undefined,
    );
  });

  it("404 → notFound; 403 → forbidden", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await getEvent("e1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await getEvent("e1")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });
  });
});

describe("events API client — setRsvp", () => {
  it("200 → ok with the status and posts the status body", async () => {
    fetchMock.mockResolvedValue(res(200, { status: "going" }));
    expect(await setRsvp("e1", "going")).toEqual({
      ok: true,
      data: { status: "going" },
    });
    expect(fetchMock).toHaveBeenCalledWith("POST", "/api/v1/events/e1/rsvp", {
      status: "going",
    });
  });

  it("403 → forbidden (non-member); 404 → notFound; 429 → rateLimited; network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await setRsvp("e1", "going")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await setRsvp("e1", "interested")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 8 }));
    expect(await setRsvp("e1", "not_going")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 8 },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await setRsvp("e1", "going")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });

  it("409 → conflict (event cancelled or past)", async () => {
    fetchMock.mockResolvedValueOnce(res(409, {}));
    expect(await setRsvp("e1", "going")).toEqual({
      ok: false,
      error: { kind: "conflict" },
    });
  });
});

describe("events API client — cancelEvent", () => {
  it("200 → ok; posts to the cancel path with no body", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await cancelEvent("e1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/events/e1/cancel",
      undefined,
    );
  });

  it("403 → forbidden; 404 → notFound; 409 → conflict (already cancelled); network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await cancelEvent("e1")).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await cancelEvent("e1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(409, {}));
    expect(await cancelEvent("e1")).toEqual({
      ok: false,
      error: { kind: "conflict" },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await cancelEvent("e1")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("events API client — createEvent", () => {
  const input = {
    title: "Spotkanie",
    location: "Warszawa",
    startsAt: "2026-07-04T16:00:00.000Z",
  };

  it("201 → ok with the created EventDTO; posts to the community events path", async () => {
    fetchMock.mockResolvedValue(res(201, EVENT));
    expect(await createEvent("c1", input)).toEqual({ ok: true, data: EVENT });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/communities/c1/events",
      input,
    );
  });

  it("forwards an optional category in the create body", async () => {
    fetchMock.mockResolvedValue(res(201, EVENT));
    await createEvent("c1", { ...input, category: "education" });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/communities/c1/events",
      { ...input, category: "education" },
    );
  });

  it("403 → forbidden (non-member); 404 → notFound; 400 → validation; 429; network", async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}));
    expect(await createEvent("c1", input)).toEqual({
      ok: false,
      error: { kind: "forbidden" },
    });

    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await createEvent("c1", input)).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(400, {}));
    expect(await createEvent("c1", input)).toEqual({
      ok: false,
      error: { kind: "validation" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 15 }));
    expect(await createEvent("c1", input)).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 15 },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await createEvent("c1", input)).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });
});

describe("events API client — save / unsave / listSaved", () => {
  it("saveEvent 200 → ok; posts to the save path with no body", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await saveEvent("e1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "POST",
      "/api/v1/events/e1/save",
      undefined,
    );
  });

  it("unsaveEvent 200 → ok; DELETEs the save path", async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect(await unsaveEvent("e1")).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "DELETE",
      "/api/v1/events/e1/save",
      undefined,
    );
  });

  it("save 404 → notFound; 429 → rateLimited; network", async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    expect(await saveEvent("e1")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });

    fetchMock.mockResolvedValueOnce(res(429, { retryAfter: 12 }));
    expect(await saveEvent("e1")).toEqual({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 12 },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await unsaveEvent("e1")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });

  it("listSavedEvents 200 → ok with the array at /events/saved; 5xx → server", async () => {
    fetchMock.mockResolvedValue(res(200, [EVENT]));
    expect(await listSavedEvents()).toEqual({ ok: true, data: [EVENT] });
    expect(fetchMock).toHaveBeenCalledWith(
      "GET",
      "/api/v1/events/saved",
      undefined,
    );

    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await listSavedEvents()).toEqual({
      ok: false,
      error: { kind: "server" },
    });
  });
});
