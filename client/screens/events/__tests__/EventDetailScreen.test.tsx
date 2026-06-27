jest.mock("@/hooks/useEvent", () => ({ useEvent: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { EventDetailScreen } from "@/screens/events/EventDetailScreen";
import { useEvent } from "@/hooks/useEvent";
import { strings } from "@/i18n";
import type { EventDTO } from "@shared/types";

const eventMock = useEvent as unknown as jest.Mock;

const event = (over: Partial<EventDTO> = {}): EventDTO => ({
  id: "e1",
  communityId: "c1",
  title: "Pride Meetup",
  description: "Spotkanie społeczności",
  location: "Warszawa",
  startsAt: "2026-07-04T16:00:00",
  endsAt: "2026-07-04T18:00:00",
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 46,
  rsvp: null,
  deleted: false,
  ...over,
});

function state(over: Partial<ReturnType<typeof useEvent>> = {}) {
  return {
    event: event(),
    status: "ready" as const,
    errorMessage: null,
    submitting: false,
    retry: jest.fn(),
    setRsvp: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

function renderDetail() {
  const route = { params: { id: "e1" } } as never;
  const navigation = {} as never;
  render(<EventDetailScreen route={route} navigation={navigation} />);
}

beforeEach(() => eventMock.mockReset());

describe("EventDetailScreen", () => {
  it("renders the event fields and going count", () => {
    eventMock.mockReturnValue(state());
    renderDetail();
    expect(screen.getByText("Pride Meetup")).toBeTruthy();
    expect(screen.getByText("Warszawa")).toBeTruthy();
    expect(screen.getByText("Spotkanie społeczności")).toBeTruthy();
    expect(screen.getByText("46 idzie")).toBeTruthy();
  });

  it("highlights the caller's current RSVP status", () => {
    eventMock.mockReturnValue(
      state({ event: event({ rsvp: { status: "going" } }) }),
    );
    renderDetail();
    const goingTab = screen.getByLabelText(strings.events.rsvpGoing);
    expect(goingTab.props.accessibilityState).toMatchObject({ selected: true });
  });

  it("calls setRsvp with the pressed status", () => {
    const setRsvp = jest.fn().mockResolvedValue({ ok: true });
    eventMock.mockReturnValue(state({ setRsvp }));
    renderDetail();
    fireEvent.press(screen.getByLabelText(strings.events.rsvpInterested));
    expect(setRsvp).toHaveBeenCalledWith("interested");
  });

  it("shows the error state with a retry", () => {
    const retry = jest.fn();
    eventMock.mockReturnValue(
      state({ event: null, status: "error", errorMessage: "Błąd", retry }),
    );
    renderDetail();
    fireEvent.press(screen.getByText(strings.events.retry));
    expect(retry).toHaveBeenCalled();
  });
});
