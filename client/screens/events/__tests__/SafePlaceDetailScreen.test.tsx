jest.mock("@/hooks/useSafePlace", () => ({ useSafePlace: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Stub the report modal: render its title + a button that fires onSubmit, so we
// can assert the report wiring without driving the real TextField.
jest.mock("@/components/ReportPostModal", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, Pressable } = require("react-native");
  return {
    ReportPostModal: ({
      visible,
      onSubmit,
      title,
    }: {
      visible: boolean;
      onSubmit: (reason: string) => Promise<{ ok: boolean }>;
      title: string;
    }) =>
      visible ? (
        <Pressable testID="do-report" onPress={() => onSubmit("bad place")}>
          <Text>{title}</Text>
        </Pressable>
      ) : null,
  };
});

import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { SafePlaceDetailScreen } from "@/screens/events/SafePlaceDetailScreen";
import { useSafePlace } from "@/hooks/useSafePlace";
import { strings } from "@/i18n";
import type { SafePlaceDTO } from "@shared/types";

const hookMock = useSafePlace as unknown as jest.Mock;

const place = (over: Partial<SafePlaceDTO> = {}): SafePlaceDTO => ({
  id: "p1",
  name: "Tęczowa Kawiarnia",
  category: "cafe",
  description: "Miłe, bezpieczne miejsce",
  address: "Marszałkowska 10",
  city: "Warszawa",
  latitude: 52.23,
  longitude: 21.01,
  imageUrl: null,
  accessibilityFeatures: [],
  saved: false,
  ...over,
});

function state(over: Partial<ReturnType<typeof useSafePlace>> = {}) {
  return {
    place: place(),
    status: "ready" as const,
    saving: false,
    retry: jest.fn(),
    toggleSave: jest.fn(),
    report: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

function renderScreen() {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as unknown as never;
  const route = { params: { id: "p1" } } as unknown as never;
  render(<SafePlaceDetailScreen navigation={navigation} route={route} />);
}

beforeEach(() => hookMock.mockReset());

describe("SafePlaceDetailScreen", () => {
  it("renders name, category and description; NEVER shows coordinates", () => {
    hookMock.mockReturnValue(state());
    renderScreen();
    expect(screen.getByText("Tęczowa Kawiarnia")).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.categories.cafe)).toBeTruthy();
    expect(screen.getByText("Miłe, bezpieczne miejsce")).toBeTruthy();
    expect(screen.queryByText(/52\.23/)).toBeNull();
    expect(screen.queryByText(/21\.01/)).toBeNull();
  });

  it("shows the photo when imageUrl is set, else the gradient placeholder", () => {
    hookMock.mockReturnValue(
      state({ place: place({ imageUrl: "https://r2/signed" }) }),
    );
    const { rerender } = render(
      <SafePlaceDetailScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { id: "p1" } } as never}
      />,
    );
    expect(screen.getByTestId("safe-place-banner")).toBeTruthy();
    expect(screen.queryByTestId("safe-place-banner-placeholder")).toBeNull();

    hookMock.mockReturnValue(state({ place: place({ imageUrl: null }) }));
    rerender(
      <SafePlaceDetailScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { id: "p1" } } as never}
      />,
    );
    expect(screen.getByTestId("safe-place-banner-placeholder")).toBeTruthy();
  });

  it("the Save button reflects saved state and toggles", () => {
    const toggleSave = jest.fn();
    hookMock.mockReturnValue(state({ toggleSave }));
    renderScreen();
    fireEvent.press(screen.getByLabelText(strings.safePlaces.saveAction));
    expect(toggleSave).toHaveBeenCalled();
  });

  it("renders the accessibility section only when features are present", () => {
    hookMock.mockReturnValue(
      state({
        place: place({
          accessibilityFeatures: ["wheelchair_accessible", "free_wifi"],
        }),
      }),
    );
    const { rerender } = render(
      <SafePlaceDetailScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { id: "p1" } } as never}
      />,
    );
    expect(screen.getByTestId("accessibility-section")).toBeTruthy();
    expect(
      screen.getByText(strings.safePlaces.accessibility.wheelchair_accessible),
    ).toBeTruthy();
    expect(
      screen.getByText(strings.safePlaces.accessibility.free_wifi),
    ).toBeTruthy();
    // The unset feature is not shown (confirmed-present-only).
    expect(
      screen.queryByText(
        strings.safePlaces.accessibility.gender_neutral_restroom,
      ),
    ).toBeNull();

    // Empty → the whole section is absent.
    hookMock.mockReturnValue(
      state({ place: place({ accessibilityFeatures: [] }) }),
    );
    rerender(
      <SafePlaceDetailScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { id: "p1" } } as never}
      />,
    );
    expect(screen.queryByTestId("accessibility-section")).toBeNull();
  });

  it("shows an error state with retry", () => {
    const retry = jest.fn();
    hookMock.mockReturnValue(state({ place: null, status: "error", retry }));
    renderScreen();
    fireEvent.press(screen.getByText(strings.safePlaces.retry));
    expect(retry).toHaveBeenCalled();
  });

  it("⋯ → Report opens the modal and submits the reason", async () => {
    const report = jest.fn().mockResolvedValue({ ok: true });
    hookMock.mockReturnValue(state({ report }));
    renderScreen();

    fireEvent.press(screen.getByLabelText(strings.safePlaces.moreActions));
    fireEvent.press(screen.getByLabelText(strings.safePlaces.reportAction));
    // The (stubbed) modal is now visible.
    await act(async () => {
      fireEvent.press(screen.getByTestId("do-report"));
    });
    expect(report).toHaveBeenCalledWith("bad place");
  });
});
