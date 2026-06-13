import { Text, Pressable } from "react-native";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { lightColors, darkColors } from "@/constants/theme";

// ThemeContext is globally mocked in setup.ts (so component tests don't need a
// provider). Here we exercise the REAL implementation via requireActual, using
// the in-memory SecureStore mock for persistence.
const { ThemeProvider, useTheme } = jest.requireActual(
  "@/contexts/ThemeContext",
) as typeof import("@/contexts/ThemeContext");

const THEME_KEY = "blis-q.theme-mode";

function Probe() {
  const { mode, colors, toggleMode } = useTheme();
  return (
    <>
      <Text testID="mode">{mode}</Text>
      <Text testID="bg">{colors.background}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="t"
        onPress={toggleMode}
      >
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

beforeEach(async () => {
  await SecureStore.deleteItemAsync(THEME_KEY);
});

describe("ThemeContext", () => {
  it("defaults to dark and exposes the dark palette", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").props.children).toBe("dark");
    expect(screen.getByTestId("bg").props.children).toBe(darkColors.background);
  });

  it("toggle switches the palette and persists the choice", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByLabelText("t"));

    expect(screen.getByTestId("mode").props.children).toBe("light");
    expect(screen.getByTestId("bg").props.children).toBe(
      lightColors.background,
    );
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync(THEME_KEY)).toBe("light"),
    );
  });

  it("rehydrates the persisted mode on mount", async () => {
    await SecureStore.setItemAsync(THEME_KEY, "light");

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("mode").props.children).toBe("light"),
    );
    expect(screen.getByTestId("bg").props.children).toBe(
      lightColors.background,
    );
  });
});
