jest.mock("@/hooks/useSavedEvents", () => ({ useSavedEvents: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { SavedEventsList } from "@/screens/events/SavedEventsList";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { strings } from "@/i18n";
import type { EventDTO } from "@shared/types";

const savedMock = useSavedEvents as unknown as jest.Mock;

const ev = (id: string, title: string): EventDTO => ({
  id,
  communityId: "c1",
  title,
  description: null,
  location: "Warszawa",
  startsAt: "2026-07-04T16:00:00",
  endsAt: null,
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 2,
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: true,
  category: null,
});

beforeEach(() => savedMock.mockReset());

describe("SavedEventsList", () => {
  it("renders saved event cards and opens one on tap", () => {
    savedMock.mockReturnValue({
      events: [ev("e1", "Pride Meetup")],
      status: "ready",
      retry: jest.fn(),
    });
    const onOpenEvent = jest.fn();
    render(<SavedEventsList onOpenEvent={onOpenEvent} />);

    fireEvent.press(screen.getByRole("button", { name: "Pride Meetup" }));
    expect(onOpenEvent).toHaveBeenCalledWith("e1");
  });

  it("shows the empty message when there are no saved events", () => {
    savedMock.mockReturnValue({
      events: [],
      status: "ready",
      retry: jest.fn(),
    });
    render(<SavedEventsList onOpenEvent={jest.fn()} />);
    expect(screen.getByText(strings.events.savedEmpty)).toBeTruthy();
  });

  it("shows an error + retry when the load fails", () => {
    const retry = jest.fn();
    savedMock.mockReturnValue({ events: [], status: "error", retry });
    render(<SavedEventsList onOpenEvent={jest.fn()} />);
    fireEvent.press(screen.getByText(strings.events.retry));
    expect(retry).toHaveBeenCalled();
  });
});
