import type {
  ConsentType,
  SessionResponse,
} from "@shared/types";
import type {
  ApiError,
  ApiResult,
  GoogleSignInInput,
} from "@/lib/api/auth";
import type {
  GoogleCredential,
  GoogleSignInOutcome,
} from "@/lib/googleAuth";

// Orchestrates the Google sign-in journey, including the first-time
// consent_required retry (docs/API.md §4). The native acquisition and the API
// exchange are INJECTED so this is pure and fully testable: the screen passes
// the real signInWithGoogle / api.googleSignIn; tests pass fakes.
//
// Flow:
//   1. startGoogleSignIn() acquires a Google credential, then exchanges it.
//   2. A new user with no consent → backend 422 → { needsConsent, credential }.
//      The screen shows the consent step and KEEPS the credential in memory
//      (never persisted, never logged — decision 6).
//   3. submitGoogleConsent(credential, consent) re-exchanges the SAME idToken
//      with consent → a session. If that fails because the token expired, the
//      screen falls back to running startGoogleSignIn() again.

export type GoogleConsent = {
  consentedTypes: ConsentType[];
  policyVersion: string;
};

// An ApiError, plus `google` = the native sign-in itself failed (not an HTTP error).
export type GoogleFlowFailure = ApiError | { kind: "google" };

export type GoogleFlowResult =
  | { status: "signedIn"; session: SessionResponse }
  | { status: "needsConsent"; credential: GoogleCredential }
  | { status: "cancelled" }
  | { status: "failed"; error: GoogleFlowFailure };

type Exchange = (
  input: GoogleSignInInput,
) => Promise<ApiResult<SessionResponse>>;

function buildInput(
  credential: GoogleCredential,
  consent?: GoogleConsent,
): GoogleSignInInput {
  return {
    idToken: credential.idToken,
    accessToken: credential.accessToken,
    nonce: credential.nonce,
    ...(consent
      ? {
          consentedTypes: consent.consentedTypes,
          policyVersion: consent.policyVersion,
        }
      : {}),
  };
}

// Exchange a credential (optionally with consent) for a session, classifying the
// backend's response into the flow's outcomes. consent_required is a control
// signal, not an error.
export async function exchangeGoogleCredential(
  credential: GoogleCredential,
  exchange: Exchange,
  consent?: GoogleConsent,
): Promise<GoogleFlowResult> {
  const result = await exchange(buildInput(credential, consent));
  if (result.ok) return { status: "signedIn", session: result.data };
  if (result.error.kind === "consentRequired") {
    return { status: "needsConsent", credential };
  }
  return { status: "failed", error: result.error };
}

// Entry point: acquire a fresh Google credential then exchange it.
export async function startGoogleSignIn(
  acquire: () => Promise<GoogleSignInOutcome>,
  exchange: Exchange,
): Promise<GoogleFlowResult> {
  const outcome = await acquire();
  if (outcome.status === "cancelled") return { status: "cancelled" };
  if (outcome.status === "error") {
    return { status: "failed", error: { kind: "google" } };
  }
  return exchangeGoogleCredential(outcome.credential, exchange);
}

// Retry after the user supplies consent, reusing the in-memory credential.
export async function submitGoogleConsent(
  credential: GoogleCredential,
  consent: GoogleConsent,
  exchange: Exchange,
): Promise<GoogleFlowResult> {
  return exchangeGoogleCredential(credential, exchange, consent);
}
