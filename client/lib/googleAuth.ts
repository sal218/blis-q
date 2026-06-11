import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

// Thin wrapper around the native Google Sign-In SDK. Screens and tests depend on
// THIS contract (a GoogleSignInOutcome), never on the SDK's shape — so the flow
// is testable by mocking this module, and an SDK upgrade touches one file.
//
// We need a Google OIDC **ID token** to hand to the backend, which exchanges it
// via Supabase signInWithIdToken (docs/API.md §4, Option A). `webClientId` is
// required so the ID token's audience matches the Google client configured on
// the Supabase Google provider — fill the client IDs at the Google/EAS
// provisioning step (see docs/STATUS.md). accessToken is optional (some native
// flows need it). nonce is reserved/passed through if ever generated; v1 does
// not mint one here.
//
// ⚠️ Requires a custom dev client / EAS build — the native module does NOT work
// in Expo Go.

export type GoogleCredential = {
  idToken: string;
  accessToken?: string;
  nonce?: string;
};

export type GoogleSignInOutcome =
  | { status: "success"; credential: GoogleCredential }
  | { status: "cancelled" }
  | { status: "error" };

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    // We only need an ID token for Supabase — no server-side offline access.
    offlineAccess: false,
  });
  configured = true;
}

function isCancellation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === statusCodes.SIGN_IN_CANCELLED
  );
}

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  try {
    ensureConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    // v13+ returns a tagged { type, data } shape; tolerate the older flat shape.
    const tagged = response as {
      type?: string;
      data?: { idToken?: string | null };
    };
    if (tagged.type === "cancelled") return { status: "cancelled" };

    const idToken =
      tagged.data?.idToken ??
      (response as { idToken?: string | null }).idToken ??
      null;
    if (!idToken) return { status: "error" };

    let accessToken: string | undefined;
    try {
      const tokens = await GoogleSignin.getTokens();
      accessToken = tokens?.accessToken ?? undefined;
    } catch {
      accessToken = undefined; // optional — Supabase verifies the ID token
    }

    return { status: "success", credential: { idToken, accessToken } };
  } catch (err) {
    if (isCancellation(err)) return { status: "cancelled" };
    // Never log err — it may carry tokens / account identifiers.
    return { status: "error" };
  }
}

// Best-effort local Google sign-out; called alongside app signOut. Swallows
// errors (there may be no active Google session).
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // no-op
  }
}
