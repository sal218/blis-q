import { Linking } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Light render test for the suspension screen (P-20). useTheme + safe-area are
// globally mocked (setup.ts); we stub useAuth and the support constant so both
// the appeal (mailto) action and back-to-login are exercised.
const mockDismiss = jest.fn();
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ dismissSuspended: mockDismiss }),
}));
jest.mock("@/constants/support", () => ({
  SUPPORT_EMAIL: "pomoc@blis-q.example",
  SUPPORT_EMAIL_CONFIGURED: true,
}));

import { AccountSuspendedScreen } from "@/screens/AccountSuspendedScreen";
import { strings } from "@/i18n";

beforeEach(() => {
  mockDismiss.mockClear();
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

describe("AccountSuspendedScreen", () => {
  it("renders the suspension title and body", () => {
    render(<AccountSuspendedScreen />);
    expect(screen.getByText(strings.accountSuspended.title)).toBeTruthy();
    expect(screen.getByText(strings.accountSuspended.body)).toBeTruthy();
  });

  it("appeal action opens a mailto: to the support address", () => {
    render(<AccountSuspendedScreen />);
    fireEvent.press(screen.getByLabelText(strings.accountSuspended.appeal));
    expect(Linking.openURL).toHaveBeenCalledWith("mailto:pomoc@blis-q.example");
  });

  it("back-to-login dismisses the suspension state", () => {
    render(<AccountSuspendedScreen />);
    fireEvent.press(
      screen.getByLabelText(strings.accountSuspended.backToLogin),
    );
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
});
