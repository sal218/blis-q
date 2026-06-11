// Session storage + native helpers are mocked so we can assert call ORDER:
// push deregistration MUST run before the session is cleared (P1).
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
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { HomePlaceholder } from "@/screens/HomePlaceholder";
import { AuthProvider } from "@/contexts/AuthContext";
import { clearSession } from "@/lib/session";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { strings } from "@/i18n";

const deregisterMock = deregisterPushToken as unknown as jest.Mock;
const clearSessionMock = clearSession as unknown as jest.Mock;

describe("HomePlaceholder — sign out", () => {
  it("deregisters the push token BEFORE clearing the session", async () => {
    render(
      <AuthProvider>
        <HomePlaceholder />
      </AuthProvider>,
    );

    fireEvent.press(screen.getByRole("button", { name: strings.common.signOut }));

    await waitFor(() => expect(clearSessionMock).toHaveBeenCalled());
    expect(deregisterMock).toHaveBeenCalled();
    // Order: deregistration runs while the access token still exists.
    expect(deregisterMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearSessionMock.mock.invocationCallOrder[0],
    );
  });
});
