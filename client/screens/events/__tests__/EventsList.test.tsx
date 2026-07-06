jest.mock("@/hooks/useEvents", () => ({ useEvents: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { EventsList } from "@/screens/events/EventsList";
import { useEvents } from "@/hooks/useEvents";
import { strings } from "@/i18n";
import type { EventDTO } from "@shared/types";

const eventsMock = useEvents as unknown as jest.Mock;

const ev = (id: string, title: string, location: string | null): EventDTO => ({
  id,
  communityId: "c1",
  title,
  description: null,
  location,
  startsAt: "2026-07-04T16:00:00",
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
  saved: false,
  category: null,
});

function state(over: Partial<ReturnType<typeof useEvents>> = {}) {
  return {
    events: [] as EventDTO[],
    status: "ready" as const,
    errorMessage: null,
    refreshing: false,
    loadingMore: false,
    category: null,
    setCategory: jest.fn(),
    toggleSave: jest.fn(),
    refresh: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
    ...over,
  };
}

beforeEach(() => eventsMock.mockReset());

describe("EventsList", () => {
  it("shows the skeleton on the first load and not once events arrive", () => {
    eventsMock.mockReturnValue(state({ status: "loading", events: [] }));
    const { rerender } = render(<EventsList onOpenEvent={jest.fn()} />);
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();

    eventsMock.mockReturnValue(state({ events: [ev("e1", "Event", null)] }));
    rerender(<EventsList onOpenEvent={jest.fn()} />);
    expect(screen.queryByTestId("card-list-skeleton")).toBeNull();
    expect(screen.getByText("Event")).toBeTruthy();
  });

  it("renders cards and opens one on press", () => {
    eventsMock.mockReturnValue(
      state({ events: [ev("e1", "Pride Meetup", "Warszawa")] }),
    );
    const onOpenEvent = jest.fn();
    render(<EventsList onOpenEvent={onOpenEvent} />);

    expect(screen.getByText("Pride Meetup")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Pride Meetup"));
    expect(onOpenEvent).toHaveBeenCalledWith("e1");
  });

  it("tapping a card's bookmark toggles save via the hook", () => {
    const toggleSave = jest.fn();
    eventsMock.mockReturnValue(
      state({ events: [ev("e1", "Pride Meetup", "Warszawa")], toggleSave }),
    );
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.press(screen.getByLabelText(strings.events.saveAction));
    expect(toggleSave).toHaveBeenCalledWith("e1");
  });

  it("shows the empty state when there are no events", () => {
    eventsMock.mockReturnValue(state({ events: [] }));
    render(<EventsList onOpenEvent={jest.fn()} />);
    expect(screen.getByText(strings.events.empty)).toBeTruthy();
  });

  it("filters by the search query (title or location), client-side", () => {
    eventsMock.mockReturnValue(
      state({
        events: [
          ev("e1", "Film Night", "Kraków"),
          ev("e2", "Coffee", "Wrocław"),
        ],
      }),
    );
    render(<EventsList onOpenEvent={jest.fn()} />);

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.searchPlaceholder),
      "wroc",
    );
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.queryByText("Film Night")).toBeNull();
  });

  it("shows the search-empty state when nothing matches", () => {
    eventsMock.mockReturnValue(
      state({ events: [ev("e1", "Film Night", "Kraków")] }),
    );
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.searchPlaceholder),
      "zzz",
    );
    expect(screen.getByText(strings.events.emptySearch)).toBeTruthy();
  });

  it("shows the error state with a retry when the load failed", () => {
    const retry = jest.fn();
    eventsMock.mockReturnValue(
      state({ events: [], status: "error", errorMessage: "Błąd", retry }),
    );
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.press(screen.getByText(strings.events.retry));
    expect(retry).toHaveBeenCalled();
  });

  // ── category filter chips (slice D2) ────────────────────────────────────────

  it("renders the filter chip row: 'Wszystkie' + every category label", () => {
    eventsMock.mockReturnValue(state({ events: [] }));
    render(<EventsList onOpenEvent={jest.fn()} />);
    expect(screen.getByText(strings.events.filterAll)).toBeTruthy();
    expect(screen.getByText(strings.events.categories.support)).toBeTruthy();
    expect(screen.getByText(strings.events.categories.activism)).toBeTruthy();
    expect(screen.getByText(strings.events.categories.other)).toBeTruthy();
  });

  it("tapping a category chip calls setCategory with that key", () => {
    const setCategory = jest.fn();
    eventsMock.mockReturnValue(state({ setCategory }));
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.press(screen.getByText(strings.events.categories.support));
    expect(setCategory).toHaveBeenCalledWith("support");
  });

  it("tapping 'Wszystkie' clears the filter (setCategory(null))", () => {
    const setCategory = jest.fn();
    eventsMock.mockReturnValue(state({ category: "support", setCategory }));
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.press(screen.getByText(strings.events.filterAll));
    expect(setCategory).toHaveBeenCalledWith(null);
  });

  it("shows the category-empty copy when a filtered feed is empty (no search)", () => {
    eventsMock.mockReturnValue(state({ events: [], category: "support" }));
    render(<EventsList onOpenEvent={jest.fn()} />);
    expect(screen.getByText(strings.events.emptyCategory)).toBeTruthy();
  });

  it("an active SEARCH that matches nothing shows emptySearch even inside a category", () => {
    eventsMock.mockReturnValue(
      state({ events: [ev("e1", "Film", "Kraków")], category: "support" }),
    );
    render(<EventsList onOpenEvent={jest.fn()} />);
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.searchPlaceholder),
      "zzz",
    );
    expect(screen.getByText(strings.events.emptySearch)).toBeTruthy();
    expect(screen.queryByText(strings.events.emptyCategory)).toBeNull();
  });
});
