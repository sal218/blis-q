jest.mock("@/hooks/useEvent", () => ({ useEvent: jest.fn() }));

import { Alert } from "react-native";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
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
  status: "active",
  cancelledAt: null,
  past: false,
  canCancel: false,
  saved: false,
  category: null,
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
    report: jest.fn().mockResolvedValue({ ok: true }),
    cancel: jest.fn().mockResolvedValue({ ok: true }),
    toggleSave: jest.fn().mockResolvedValue({ ok: true }),
    saving: false,
    ...over,
  };
}

function renderDetail(
  params: { id: string; fromHome?: boolean } = { id: "e1" },
) {
  const goBack = jest.fn();
  const navigate = jest.fn();
  const route = { params } as never;
  const navigation = { goBack, navigate } as unknown as never;
  render(<EventDetailScreen route={route} navigation={navigation} />);
  return { goBack, navigate };
}

beforeEach(() => eventMock.mockReset());

describe("EventDetailScreen", () => {
  it("renders the event fields, the date badge and going count", () => {
    eventMock.mockReturnValue(state());
    renderDetail();
    expect(screen.getByText("Pride Meetup")).toBeTruthy();
    expect(screen.getByText("Warszawa")).toBeTruthy();
    expect(screen.getByText("Spotkanie społeczności")).toBeTruthy();
    expect(screen.getByText("46 osób idzie")).toBeTruthy();
    // stacked date badge for 2026-07-04 (a Saturday in July) → SOB / 4 / LIP
    expect(screen.getByText("SOB")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("LIP")).toBeTruthy();
    // the time row and a separate full-date row (no duplicated time)
    expect(screen.getByText("16:00 – 18:00")).toBeTruthy();
    expect(screen.getByText("4 lipca 2026")).toBeTruthy();
  });

  it("shows the gradient placeholder (no image) when the event has no banner", () => {
    eventMock.mockReturnValue(state()); // default imageUrl: null
    renderDetail();
    expect(screen.getByTestId("event-banner-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("event-banner")).toBeNull();
    // privacy: going COUNT only — no attendee images/identities are rendered
    expect(screen.getByText("46 osób idzie")).toBeTruthy();
  });

  it("renders the banner image when the event has one", () => {
    eventMock.mockReturnValue(
      state({ event: event({ imageUrl: "https://cdn.example/e1.jpg" }) }),
    );
    renderDetail();
    expect(screen.getByTestId("event-banner")).toBeTruthy();
    expect(screen.queryByTestId("event-banner-placeholder")).toBeNull();
  });

  it("marks the going toggle selected when the caller is going", () => {
    eventMock.mockReturnValue(
      state({ event: event({ rsvp: { status: "going" } }) }),
    );
    renderDetail();
    const goBtn = screen.getByLabelText(strings.events.rsvpGoing);
    expect(goBtn.props.accessibilityState).toMatchObject({ selected: true });
  });

  it("tapping the toggle when NOT going → setRsvp('going')", () => {
    const setRsvp = jest.fn().mockResolvedValue({ ok: true });
    eventMock.mockReturnValue(state({ setRsvp })); // default rsvp: null
    renderDetail();
    fireEvent.press(screen.getByLabelText(strings.events.rsvpGoing));
    expect(setRsvp).toHaveBeenCalledWith("going");
  });

  it("tapping the toggle when already going → setRsvp('not_going')", () => {
    const setRsvp = jest.fn().mockResolvedValue({ ok: true });
    eventMock.mockReturnValue(
      state({ event: event({ rsvp: { status: "going" } }), setRsvp }),
    );
    renderDetail();
    fireEvent.press(screen.getByLabelText(strings.events.rsvpGoing));
    expect(setRsvp).toHaveBeenCalledWith("not_going");
  });

  it("the floating back button goes back", () => {
    eventMock.mockReturnValue(state());
    const { goBack } = renderDetail();
    fireEvent.press(screen.getByLabelText(strings.common.back));
    expect(goBack).toHaveBeenCalled();
  });

  it("Back returns to Home when opened from Home (fromHome)", () => {
    eventMock.mockReturnValue(state());
    const { goBack, navigate } = renderDetail({ id: "e1", fromHome: true });
    fireEvent.press(screen.getByLabelText(strings.common.back));
    expect(navigate).toHaveBeenCalledWith("Home");
    expect(goBack).not.toHaveBeenCalled();
  });

  it("⋯ → action sheet → report modal → submits the reason", async () => {
    const report = jest.fn().mockResolvedValue({ ok: true });
    eventMock.mockReturnValue(state({ report }));
    renderDetail();

    // ⋯ opens the action sheet (the Report row appears)
    fireEvent.press(screen.getByLabelText(strings.events.moreActions));
    fireEvent.press(screen.getByText(strings.events.reportEvent));

    // the report modal is open → fill a reason + submit
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.reportPlaceholder),
      "  spam  ",
    );
    fireEvent.press(screen.getByText(strings.posts.reportSubmit));

    await waitFor(() => expect(report).toHaveBeenCalledWith("spam")); // trimmed
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

  it("cancelled event → shows the notice, closes RSVP, hides the cancel action", () => {
    eventMock.mockReturnValue(
      state({ event: event({ status: "cancelled", canCancel: false }) }),
    );
    renderDetail();
    expect(screen.getByText(strings.events.cancelledNotice)).toBeTruthy();
    // RSVP is closed: the going toggle is gone, replaced by a disabled pill
    expect(screen.queryByLabelText(strings.events.rsvpGoing)).toBeNull();
    expect(screen.getByText(strings.events.rsvpClosedCancelled)).toBeTruthy();
    // the ⋯ sheet offers Report but NOT the cancel action (canCancel false)
    fireEvent.press(screen.getByLabelText(strings.events.moreActions));
    expect(screen.getByText(strings.events.reportEvent)).toBeTruthy();
    expect(screen.queryByText(strings.events.cancelAction)).toBeNull();
  });

  it("past event → shows the past notice and a closed RSVP bar", () => {
    eventMock.mockReturnValue(state({ event: event({ past: true }) }));
    renderDetail();
    expect(screen.getByText(strings.events.pastNotice)).toBeTruthy();
    expect(screen.queryByLabelText(strings.events.rsvpGoing)).toBeNull();
    expect(screen.getByText(strings.events.rsvpClosedPast)).toBeTruthy();
  });

  it("creator (canCancel) → ⋯ shows cancel → confirm → calls cancel()", async () => {
    const cancel = jest.fn().mockResolvedValue({ ok: true });
    const alertSpy = jest.spyOn(Alert, "alert");
    eventMock.mockReturnValue(
      state({ event: event({ canCancel: true }), cancel }),
    );
    renderDetail();

    fireEvent.press(screen.getByLabelText(strings.events.moreActions));
    fireEvent.press(screen.getByText(strings.events.cancelAction));

    // onCancelEvent → Alert.alert(title, body, buttons); invoke the destructive.
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as
      | { text: string; style?: string; onPress?: () => void }[]
      | undefined;
    const destructive = buttons?.find((b) => b.style === "destructive");
    await act(async () => {
      await destructive?.onPress?.();
    });
    expect(cancel).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("non-creator active event → no cancel action in the ⋯ sheet", () => {
    eventMock.mockReturnValue(state({ event: event({ canCancel: false }) }));
    renderDetail();
    fireEvent.press(screen.getByLabelText(strings.events.moreActions));
    expect(screen.queryByText(strings.events.cancelAction)).toBeNull();
    expect(screen.getByText(strings.events.reportEvent)).toBeTruthy();
  });

  it("open event → two-button bar: the going toggle AND the Save button", () => {
    eventMock.mockReturnValue(state({ event: event({ saved: false }) }));
    renderDetail();
    expect(screen.getByLabelText(strings.events.rsvpGoing)).toBeTruthy();
    // not saved → the "Zapisz" label + a11y label
    expect(screen.getByLabelText(strings.events.saveAction)).toBeTruthy();
  });

  it("shows the saved state and tapping Save calls toggleSave", () => {
    const toggleSave = jest.fn().mockResolvedValue({ ok: true });
    eventMock.mockReturnValue(
      state({ event: event({ saved: true }), toggleSave }),
    );
    renderDetail();
    // saved → the "Zapisano" a11y label
    const saveBtn = screen.getByLabelText(strings.events.savedAction);
    expect(saveBtn.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(saveBtn);
    expect(toggleSave).toHaveBeenCalled();
  });

  it("cancelled/past event → no Save button (RSVP bar is the closed pill)", () => {
    eventMock.mockReturnValue(state({ event: event({ status: "cancelled" }) }));
    renderDetail();
    expect(screen.queryByLabelText(strings.events.saveAction)).toBeNull();
    expect(screen.queryByLabelText(strings.events.savedAction)).toBeNull();
  });

  it("renders the category chip when the event has a category (slice D2)", () => {
    eventMock.mockReturnValue(state({ event: event({ category: "culture" }) }));
    renderDetail();
    expect(screen.getByText(strings.events.categories.culture)).toBeTruthy();
  });

  it("renders no category chip when the event has none", () => {
    eventMock.mockReturnValue(state({ event: event({ category: null }) }));
    renderDetail();
    expect(screen.queryByText(strings.events.categories.culture)).toBeNull();
  });
});
