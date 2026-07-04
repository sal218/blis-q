import { render, screen, fireEvent } from "@testing-library/react-native";
import { EventCard } from "@/components/EventCard";
import { strings } from "@/i18n";
import type { EventDTO } from "@shared/types";

// Local (no-Z) datetimes → getDay()/getHours() are deterministic regardless of
// the runner's timezone. 2026-07-04 is a Saturday (SOB).
const event: EventDTO = {
  id: "e1",
  communityId: "c1",
  title: "Pride Planning Meetup",
  description: null,
  location: "Warszawa",
  startsAt: "2026-07-04T16:00:00",
  endsAt: "2026-07-04T18:00:00",
  imageUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  goingCount: 46,
  rsvp: null,
  deleted: false,
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
  category: null,
};

describe("EventCard", () => {
  it("renders the date badge, time range, location and going count", () => {
    render(<EventCard event={event} onPress={jest.fn()} />);
    expect(screen.getByText("SOB")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Pride Planning Meetup")).toBeTruthy();
    expect(screen.getByText(/16:00 – 18:00/)).toBeTruthy();
    expect(screen.getByText(/Warszawa/)).toBeTruthy();
    // Going COUNT only — never attendee identities.
    expect(screen.getByText("46 idzie")).toBeTruthy();
  });

  it("calls onPress with the event id", () => {
    const onPress = jest.fn();
    render(<EventCard event={event} onPress={onPress} />);
    fireEvent.press(screen.getByLabelText("Pride Planning Meetup"));
    expect(onPress).toHaveBeenCalledWith("e1");
  });

  it("shows just the start time when there is no end time", () => {
    render(
      <EventCard event={{ ...event, endsAt: null }} onPress={jest.fn()} />,
    );
    expect(screen.getByText(/16:00/)).toBeTruthy();
    expect(screen.queryByText(/–/)).toBeNull();
  });

  it("renders the category chip when the event has a category (slice D2)", () => {
    render(
      <EventCard
        event={{ ...event, category: "support" }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(strings.events.categories.support)).toBeTruthy();
  });

  it("renders no category chip when category is null", () => {
    render(<EventCard event={event} onPress={jest.fn()} />); // category null
    expect(screen.queryByText(strings.events.categories.support)).toBeNull();
  });

  it("renders a save bookmark when onToggleSave is provided; tap calls it", () => {
    const onToggleSave = jest.fn();
    render(
      <EventCard
        event={event}
        onPress={jest.fn()}
        onToggleSave={onToggleSave}
      />,
    ); // event.saved is false → the "Zapisz" a11y label
    fireEvent.press(screen.getByLabelText(strings.events.saveAction));
    expect(onToggleSave).toHaveBeenCalledWith(event);
  });

  it("shows the saved (Zapisano) bookmark when event.saved", () => {
    render(
      <EventCard
        event={{ ...event, saved: true }}
        onPress={jest.fn()}
        onToggleSave={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(strings.events.savedAction)).toBeTruthy();
  });

  it("renders no bookmark without onToggleSave (Home rail / saved list)", () => {
    render(<EventCard event={event} onPress={jest.fn()} />);
    expect(screen.queryByLabelText(strings.events.saveAction)).toBeNull();
    expect(screen.queryByLabelText(strings.events.savedAction)).toBeNull();
  });
});
