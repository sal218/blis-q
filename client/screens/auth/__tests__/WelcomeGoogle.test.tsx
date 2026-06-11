jest.mock("@/lib/googleAuth", () => ({
  signInWithGoogle: jest.fn(),
  signOutGoogle: jest.fn(),
}));
jest.mock("@/lib/api/auth", () => ({ googleSignIn: jest.fn() }));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { WelcomeScreen } from "@/screens/auth/WelcomeScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { signInWithGoogle } from "@/lib/googleAuth";
import { googleSignIn } from "@/lib/api/auth";
import { strings } from "@/i18n";

const acquireMock = signInWithGoogle as unknown as jest.Mock;
const exchangeMock = googleSignIn as unknown as jest.Mock;

const SESSION = {
  user: { id: "u1", email: "ola@example.pl", displayName: "Ola" },
  session: { accessToken: "at", refreshToken: "rt", expiresAt: "2030-01-01" },
};

function renderScreen() {
  const navigation = { navigate: jest.fn() };
  render(
    <AuthProvider>
      <WelcomeScreen
        navigation={navigation as never}
        route={{ key: "w", name: "Welcome", params: undefined } as never}
      />
    </AuthProvider>,
  );
  return { navigation };
}

beforeEach(() => {
  acquireMock.mockReset();
  exchangeMock.mockReset();
});

describe("WelcomeScreen — Google consent_required → consent → retry", () => {
  it("first sign-in asks for consent, then retries the SAME token with consent and signs in", async () => {
    acquireMock.mockResolvedValue({
      status: "success",
      credential: { idToken: "tok", accessToken: "acc" },
    });
    // First exchange (no consent) → 422; second (with consent) → session.
    exchangeMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "consentRequired" } })
      .mockResolvedValueOnce({ ok: true, data: SESSION });

    renderScreen();

    fireEvent.press(
      screen.getByRole("button", { name: strings.welcome.continueWithGoogle }),
    );

    // Consent sheet appears for the first-time user.
    expect(await screen.findByText(strings.consent.googleTitle)).toBeTruthy();

    // Give consent and confirm.
    fireEvent.press(
      screen.getByRole("checkbox", { name: strings.consent.accountCreation }),
    );
    fireEvent.press(screen.getByRole("button", { name: strings.consent.confirm }));

    // The token was exchanged twice; the second call carried consent.
    await waitFor(() => expect(exchangeMock).toHaveBeenCalledTimes(2));
    expect(exchangeMock.mock.calls[0][0]).toEqual({
      idToken: "tok",
      accessToken: "acc",
      nonce: undefined,
    });
    expect(exchangeMock.mock.calls[1][0].consentedTypes).toContain(
      "account_creation",
    );
    expect(exchangeMock.mock.calls[1][0].idToken).toBe("tok");

    // Consent sheet dismissed after success.
    await waitFor(() =>
      expect(screen.queryByText(strings.consent.googleTitle)).toBeNull(),
    );
  });

  it("cancelled Google sign-in shows no error and no consent sheet", async () => {
    acquireMock.mockResolvedValue({ status: "cancelled" });
    renderScreen();

    fireEvent.press(
      screen.getByRole("button", { name: strings.welcome.continueWithGoogle }),
    );

    await waitFor(() => expect(acquireMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(strings.consent.googleTitle)).toBeNull();
    expect(exchangeMock).not.toHaveBeenCalled();
  });
});
