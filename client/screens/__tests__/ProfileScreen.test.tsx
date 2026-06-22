// Session storage + native helpers mocked so we can assert call ORDER on
// sign-out: push deregistration MUST run before the session is cleared (P1).
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

import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { clearSession } from "@/lib/session";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { strings } from "@/i18n";

const deregisterMock = deregisterPushToken as unknown as jest.Mock;
const clearSessionMock = clearSession as unknown as jest.Mock;

// Render, then flush AuthProvider's async session-bootstrap effect with an
// empty act() so its state updates are wrapped and no warnings leak. (render is
// already act-wrapped internally, so it must not be nested inside another act.)
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

describe("ProfileScreen", () => {
  it("renders the sun/moon theme toggle + blocked-users entry", async () => {
    await renderScreen();
    expect(screen.getByText(strings.profile.appearance)).toBeTruthy();
    // The ThemeToggle pill (same control as the login screen).
    expect(
      screen.getByRole("button", { name: strings.profile.themeLight }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: strings.profile.themeDark }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: strings.profile.blockedUsers }),
    ).toBeTruthy();
  });

  it("blocked-users entry navigates to the BlockedUsers screen", async () => {
    const { navigation } = await renderScreen();
    fireEvent.press(
      screen.getByRole("button", { name: strings.profile.blockedUsers }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("BlockedUsers");
  });

  it("sign out deregisters the push token BEFORE clearing the session", async () => {
    await renderScreen();
    fireEvent.press(
      screen.getByRole("button", { name: strings.common.signOut }),
    );

    await waitFor(() => expect(clearSessionMock).toHaveBeenCalled());
    expect(deregisterMock).toHaveBeenCalled();
    expect(deregisterMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearSessionMock.mock.invocationCallOrder[0],
    );
  });
});
