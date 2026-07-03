jest.mock("@/lib/api/events", () => ({ createEvent: jest.fn() }));

// Stub the native date/time picker: render a pressable that, when pressed,
// fires onChange with a test-controlled date (globalThis.__pickedDate).
jest.mock("@react-native-community/datetimepicker", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({
      testID,
      onChange,
    }: {
      testID?: string;
      onChange: (e: { type: string }, d?: Date) => void;
    }) =>
      React.createElement(Pressable, {
        testID: testID ?? "event-picker",
        onPress: () =>
          onChange(
            { type: "set" },
            (globalThis as { __pickedDate?: Date }).__pickedDate,
          ),
      }),
  };
});

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CreateEventScreen } from "@/screens/events/CreateEventScreen";
import { createEvent } from "@/lib/api/events";
import { strings } from "@/i18n";

const createMock = createEvent as unknown as jest.Mock;

function renderScreen() {
  const navigation = { replace: jest.fn(), navigate: jest.fn() };
  const route = { params: { communityId: "c1" } };
  render(
    <CreateEventScreen
      navigation={navigation as never}
      route={route as never}
    />,
  );
  return { navigation };
}

beforeEach(() => {
  createMock.mockReset();
  (globalThis as { __pickedDate?: Date }).__pickedDate = undefined;
});

describe("CreateEventScreen", () => {
  it("blocks submit with no title (titleRequired) and makes no API call", () => {
    renderScreen();
    fireEvent.press(screen.getByText(strings.events.create));
    expect(screen.getByText(strings.events.titleRequired)).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("valid submit → createEvent with title + ISO start, then replace to detail", async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: "e9" } });
    const { navigation } = renderScreen();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.titlePlaceholder),
      "  Spotkanie  ",
    );
    fireEvent.press(screen.getByText(strings.events.create));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [communityId, payload] = createMock.mock.calls[0];
    expect(communityId).toBe("c1");
    expect(payload.title).toBe("Spotkanie"); // trimmed
    expect(payload.startsAt).toEqual(expect.any(String));
    expect(payload.endsAt).toBeUndefined();
    expect(payload.category).toBeUndefined(); // no category selected → omitted
    expect(navigation.replace).toHaveBeenCalledWith("EventDetail", {
      id: "e9",
    });
  });

  it("selecting a category includes it in the create payload (slice D2)", async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: "e9" } });
    renderScreen();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.titlePlaceholder),
      "Spotkanie",
    );
    fireEvent.press(screen.getByText(strings.events.categories.education));
    fireEvent.press(screen.getByText(strings.events.create));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].category).toBe("education");
  });

  it("tapping the selected category chip again clears it (omitted from payload)", async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: "e9" } });
    renderScreen();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.titlePlaceholder),
      "Spotkanie",
    );
    const chip = screen.getByText(strings.events.categories.education);
    fireEvent.press(chip); // select
    fireEvent.press(chip); // deselect
    fireEvent.press(screen.getByText(strings.events.create));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].category).toBeUndefined();
  });

  it("an end time before the start → endBeforeStart, no API call", async () => {
    renderScreen();
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.titlePlaceholder),
      "Spotkanie",
    );
    // enable an end time (defaults to start + 1h), then pick an earlier DATE.
    // On iOS (jest-expo default) the picker IS the inline control, so pressing
    // its testID fires onChange directly.
    fireEvent.press(screen.getByTestId("add-end"));
    (globalThis as { __pickedDate?: Date }).__pickedDate = new Date(
      "2020-01-01T10:00:00",
    );
    fireEvent.press(screen.getByTestId("end-date"));

    fireEvent.press(screen.getByText(strings.events.create));
    await waitFor(() =>
      expect(screen.getByText(strings.events.endBeforeStart)).toBeTruthy(),
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("403 → the create-specific forbidden copy (not the RSVP copy)", async () => {
    createMock.mockResolvedValue({ ok: false, error: { kind: "forbidden" } });
    renderScreen();
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.events.titlePlaceholder),
      "Spotkanie",
    );
    fireEvent.press(screen.getByText(strings.events.create));

    await waitFor(() =>
      expect(screen.getByText(strings.events.createForbidden)).toBeTruthy(),
    );
    // not the RSVP wording
    expect(screen.queryByText(strings.events.rsvpForbidden)).toBeNull();
  });
});
