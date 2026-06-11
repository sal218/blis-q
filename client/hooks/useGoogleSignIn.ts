import { useCallback, useRef, useState } from "react";
import type { SessionResponse } from "@shared/types";
import {
  startGoogleSignIn,
  submitGoogleConsent,
  type GoogleConsent,
  type GoogleFlowFailure,
} from "@/lib/googleFlow";
import { signInWithGoogle, type GoogleCredential } from "@/lib/googleAuth";
import { googleSignIn } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";

// Drives the Google sign-in UX state for a screen. The in-flight credential is
// held in a ref — it is NEVER persisted, put in navigation params, or logged
// (decision 6). When the backend asks for consent (new user), `needsConsent`
// flips so the screen can show the consent step; submitGoogleConsent reuses the
// same credential. If that reuse fails (e.g. the ID token expired), we re-run
// Google sign-in once with a fresh token and retry the consent automatically.

type Props = {
  onSignedIn: (session: SessionResponse) => Promise<void> | void;
};

function messageFor(error: GoogleFlowFailure): string {
  return error.kind === "google"
    ? strings.errors.googleFailed
    : apiErrorMessage(error);
}

export function useGoogleSignIn({ onSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credentialRef = useRef<GoogleCredential | null>(null);

  const reset = useCallback(() => {
    credentialRef.current = null;
    setNeedsConsent(false);
    setError(null);
  }, []);

  // Button tap: acquire a credential and exchange it.
  const start = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await startGoogleSignIn(signInWithGoogle, googleSignIn);
      switch (result.status) {
        case "signedIn":
          reset();
          await onSignedIn(result.session);
          break;
        case "needsConsent":
          credentialRef.current = result.credential;
          setNeedsConsent(true);
          break;
        case "cancelled":
          break; // user backed out — no error shown
        case "failed":
          setError(messageFor(result.error));
          break;
      }
    } finally {
      setLoading(false);
    }
  }, [onSignedIn, reset]);

  // Consent step submit: reuse the stored credential; re-acquire once on failure.
  const submitConsent = useCallback(
    async (consent: GoogleConsent) => {
      const credential = credentialRef.current;
      if (!credential) return;
      setError(null);
      setLoading(true);
      try {
        let result = await submitGoogleConsent(credential, consent, googleSignIn);

        // Stored ID token rejected (likely expired) → fresh sign-in, retry once.
        if (result.status === "failed" && result.error.kind !== "google") {
          const fresh = await startGoogleSignIn(signInWithGoogle, googleSignIn);
          if (fresh.status === "needsConsent") {
            credentialRef.current = fresh.credential;
            result = await submitGoogleConsent(
              fresh.credential,
              consent,
              googleSignIn,
            );
          } else {
            result = fresh;
          }
        }

        switch (result.status) {
          case "signedIn":
            reset();
            await onSignedIn(result.session);
            break;
          case "cancelled":
            reset();
            break;
          case "needsConsent":
            // Anomalous: consent was supplied but the backend still refused.
            setError(strings.errors.generic);
            break;
          case "failed":
            setError(messageFor(result.error));
            break;
        }
      } finally {
        setLoading(false);
      }
    },
    [onSignedIn, reset],
  );

  return {
    start,
    submitConsent,
    cancelConsent: reset,
    loading,
    needsConsent,
    error,
  };
}
