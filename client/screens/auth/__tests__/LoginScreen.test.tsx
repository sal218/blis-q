jest.mock("@/lib/api/auth", () => ({ login: jest.fn() }));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { login } from "@/lib/api/auth";
import { strings, format } from "@/i18n";

const loginMock = login as unknown as jest.Mock;

function renderScreen() {
  const navigation = { navigate: jest.fn() };
  render(
    <AuthProvider>
      <LoginScreen
        navigation={navigation as never}
        route={{ key: "l", name: "Login", params: undefined } as never}
      />
    </AuthProvider>,
  );
  return { navigation };
}

beforeEach(() => loginMock.mockReset());

describe("LoginScreen — rate limit (429) messaging", () => {
  it("shows the retry-after countdown copy on 429", async () => {
    loginMock.mockResolvedValue({
      ok: false,
      error: { kind: "rateLimited", retryAfter: 30 },
    });
    renderScreen();

    fireEvent.changeText(screen.getByLabelText(strings.common.email), "ola@example.pl");
    fireEvent.changeText(screen.getByLabelText(strings.common.password), "supersecret");
    fireEvent.press(screen.getByRole("button", { name: strings.login.submit }));

    const expected = format(strings.errors.rateLimited, { seconds: 30 });
    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it("shows generic invalid-credentials copy on 401", async () => {
    loginMock.mockResolvedValue({
      ok: false,
      error: { kind: "invalidCredentials" },
    });
    renderScreen();

    fireEvent.changeText(screen.getByLabelText(strings.common.email), "ola@example.pl");
    fireEvent.changeText(screen.getByLabelText(strings.common.password), "wrongpass");
    fireEvent.press(screen.getByRole("button", { name: strings.login.submit }));

    await waitFor(() =>
      expect(
        screen.getByText(strings.errors.invalidCredentials),
      ).toBeTruthy(),
    );
  });
});
