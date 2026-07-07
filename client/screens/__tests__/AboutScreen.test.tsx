jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.2.3" } },
}));

import { render, screen } from "@testing-library/react-native";
import { AboutScreen } from "@/screens/AboutScreen";
import { strings, format } from "@/i18n";

describe("AboutScreen", () => {
  it("renders the app name, version and mission blurb", () => {
    render(
      <AboutScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{} as never}
      />,
    );
    expect(screen.getByText(strings.common.appName)).toBeTruthy();
    expect(
      screen.getByText(format(strings.about.version, { version: "1.2.3" })),
    ).toBeTruthy();
    expect(screen.getByText(strings.about.body)).toBeTruthy();
  });
});
