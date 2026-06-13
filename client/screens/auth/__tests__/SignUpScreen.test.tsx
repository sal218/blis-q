jest.mock("@/lib/api/auth", () => ({ signUp: jest.fn() }));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { SignUpScreen } from "@/screens/auth/SignUpScreen";
import { signUp } from "@/lib/api/auth";
import { strings } from "@/i18n";

const signUpMock = signUp as unknown as jest.Mock;

function renderScreen() {
  const navigation = { navigate: jest.fn() };
  render(
    <SignUpScreen
      navigation={navigation as never}
      route={{ key: "s", name: "SignUp", params: undefined } as never}
    />,
  );
  return { navigation };
}

beforeEach(() => signUpMock.mockReset());

describe("SignUpScreen — consent gating", () => {
  it("submit is disabled until account_creation consent is checked", () => {
    renderScreen();
    const submit = screen.getByRole("button", { name: strings.signUp.submit });
    expect(submit).toBeDisabled();

    fireEvent.press(
      screen.getByRole("checkbox", { name: strings.consent.accountCreation }),
    );
    expect(submit).toBeEnabled();
  });

  it("submits with consentedTypes including account_creation, then routes to CheckEmail", async () => {
    signUpMock.mockResolvedValue({ ok: true, data: { accepted: true } });
    const { navigation } = renderScreen();

    fireEvent.changeText(
      screen.getByLabelText(strings.common.displayName),
      "Ola",
    );
    fireEvent.changeText(
      screen.getByLabelText(strings.common.email),
      "ola@example.pl",
    );
    fireEvent.changeText(
      screen.getByLabelText(strings.common.password),
      "supersecret",
    );
    fireEvent.press(
      screen.getByRole("checkbox", { name: strings.consent.accountCreation }),
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.signUp.submit }),
    );

    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1));
    expect(signUpMock.mock.calls[0][0].consentedTypes).toContain(
      "account_creation",
    );
    expect(signUpMock.mock.calls[0][0].email).toBe("ola@example.pl");
    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith("CheckEmail", {
        email: "ola@example.pl",
      }),
    );
  });
});
