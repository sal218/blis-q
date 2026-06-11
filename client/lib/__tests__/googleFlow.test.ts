import {
  startGoogleSignIn,
  submitGoogleConsent,
  exchangeGoogleCredential,
  type GoogleConsent,
} from "@/lib/googleFlow";
import type { GoogleSignInOutcome, GoogleCredential } from "@/lib/googleAuth";
import type { ApiResult, GoogleSignInInput } from "@/lib/api/auth";
import type { SessionResponse } from "@shared/types";

const CREDENTIAL: GoogleCredential = { idToken: "tok", accessToken: "acc" };

const SESSION = {
  user: { id: "u1", email: "a@b.pl", displayName: "Ola" },
  session: { accessToken: "at", refreshToken: "rt", expiresAt: "2030-01-01" },
} as unknown as SessionResponse;

const CONSENT: GoogleConsent = {
  consentedTypes: ["account_creation"],
  policyVersion: "2026-06-10",
};

const acquire = (outcome: GoogleSignInOutcome) => async () => outcome;
const exchangeReturning =
  (...results: ApiResult<SessionResponse>[]) =>
  async (): Promise<ApiResult<SessionResponse>> =>
    results.shift() ?? { ok: false, error: { kind: "server" } };

describe("startGoogleSignIn", () => {
  it("cancelled acquisition → cancelled", async () => {
    const result = await startGoogleSignIn(
      acquire({ status: "cancelled" }),
      exchangeReturning(),
    );
    expect(result.status).toBe("cancelled");
  });

  it("native error → failed with google kind", async () => {
    const result = await startGoogleSignIn(
      acquire({ status: "error" }),
      exchangeReturning(),
    );
    expect(result).toEqual({ status: "failed", error: { kind: "google" } });
  });

  it("returning user (exchange ok) → signedIn", async () => {
    const result = await startGoogleSignIn(
      acquire({ status: "success", credential: CREDENTIAL }),
      exchangeReturning({ ok: true, data: SESSION }),
    );
    expect(result).toEqual({ status: "signedIn", session: SESSION });
  });

  it("new user (exchange consent_required) → needsConsent, carries credential", async () => {
    const result = await startGoogleSignIn(
      acquire({ status: "success", credential: CREDENTIAL }),
      exchangeReturning({ ok: false, error: { kind: "consentRequired" } }),
    );
    expect(result).toEqual({ status: "needsConsent", credential: CREDENTIAL });
  });
});

describe("exchangeGoogleCredential", () => {
  it("server error → failed", async () => {
    const result = await exchangeGoogleCredential(
      CREDENTIAL,
      exchangeReturning({ ok: false, error: { kind: "server" } }),
    );
    expect(result).toEqual({ status: "failed", error: { kind: "server" } });
  });
});

describe("submitGoogleConsent", () => {
  it("re-exchanges the SAME credential WITH consent → signedIn", async () => {
    const exchange = jest
      .fn<Promise<ApiResult<SessionResponse>>, [GoogleSignInInput]>()
      .mockResolvedValue({ ok: true, data: SESSION });

    const result = await submitGoogleConsent(CREDENTIAL, CONSENT, exchange);

    expect(result).toEqual({ status: "signedIn", session: SESSION });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith({
      idToken: "tok",
      accessToken: "acc",
      nonce: undefined,
      consentedTypes: ["account_creation"],
      policyVersion: "2026-06-10",
    });
  });
});
