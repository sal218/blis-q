// The Help & Support row renders only when a support email is configured. Here
// we mock @/constants/support as configured and assert the row opens a mailto.
jest.mock("@/constants/support", () => ({
  SUPPORT_EMAIL: "help@blisq.app",
  SUPPORT_EMAIL_CONFIGURED: true,
}));
jest.mock("@/lib/session", () => ({
  loadSession: jest.fn().mockResolvedValue(null),
  saveSession: jest.fn(),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/notifications/usePushNotifications", () => ({
  usePushNotifications: jest.fn(),
  deregisterPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/googleAuth", () => ({
  signOutGoogle: jest.fn().mockResolvedValue(undefined),
}));

import { Linking } from "react-native";
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { strings } from "@/i18n";

async function renderScreen() {
  const navigation = { navigate: jest.fn() };
  render(
    <AuthProvider>
      <ProfileScreen
        navigation={navigation as never}
        route={{ key: "p", name: "ProfileHome", params: undefined } as never}
      />
    </AuthProvider>,
  );
  await act(async () => {});
  return { navigation };
}

describe("ProfileScreen — Help & Support (email configured)", () => {
  it("shows the Help row and opens a mailto to the configured address", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(true as unknown as never);
    await renderScreen();

    const helpRow = screen.getByRole("button", { name: strings.profile.help });
    fireEvent.press(helpRow);
    expect(openURL).toHaveBeenCalledWith("mailto:help@blisq.app");
    openURL.mockRestore();
  });
});
