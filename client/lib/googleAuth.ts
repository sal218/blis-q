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
// ⚠️ The native module ONLY works in a custom dev client / EAS build — Expo Go
// does not bundle it, and evaluating it there throws "RNGoogleSignin could not
// be found" (TurboModule). So we detect the runtime and NEVER load the module in
// Expo Go (or on web): sign-in returns { status: "error" }, sign-out is a no-op.
// Native behavior is unchanged in dev-client / EAS builds.
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

// Type-only import (erased at compile time) — does not pull the native module
// into the boot bundle. It is loaded lazily, and ONLY when the guard below says
// the native module is actually present.
type GoogleSigninModule =
  typeof import("@react-native-google-signin/google-signin");

// True only in a dev-client / EAS build (not Expo Go, not web). When false we
// must not touch @react-native-google-signin/google-signin at all — not even a
// lazy import() — or it throws on evaluation.
const isNativeGoogleAvailable =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export type GoogleCredential = {
  idToken: string;
  accessToken?: string;
  nonce?: string;
};

export type GoogleSignInOutcome =
  | { status: "success"; credential: GoogleCredential }
  | { status: "cancelled" }
  | { status: "error" };

// Cache the module promise so the dynamic import only happens once.
let modulePromise: Promise<GoogleSigninModule> | null = null;
function loadGoogleModule(): Promise<GoogleSigninModule> {
  if (!modulePromise) {
    modulePromise = import("@react-native-google-signin/google-signin");
  }
  return modulePromise;
}

let configured = false;
function ensureConfigured(
  googleSignin: GoogleSigninModule["GoogleSignin"],
): void {
  if (configured) return;
  googleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    // We only need an ID token for Supabase — no server-side offline access.
    offlineAccess: false,
  });
  configured = true;
}

function isCancellation(
  err: unknown,
  statusCodes: GoogleSigninModule["statusCodes"],
): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === statusCodes.SIGN_IN_CANCELLED
  );
}

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  // Expo Go / web: the native module isn't present — never load it.
  if (!isNativeGoogleAvailable) return { status: "error" };

  let mod: GoogleSigninModule;
  try {
    mod = await loadGoogleModule();
  } catch {
    // Defensive: a dev/EAS build where the module still failed to load.
    return { status: "error" };
  }

  const { GoogleSignin, statusCodes } = mod;
  try {
    ensureConfigured(GoogleSignin);
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
    if (isCancellation(err, statusCodes)) return { status: "cancelled" };
    // Never log err — it may carry tokens / account identifiers.
    return { status: "error" };
  }
}

// Best-effort local Google sign-out; called alongside app signOut. Swallows
// errors (there may be no active Google session, or — in Expo Go — no native
// module at all), so it's a safe no-op everywhere.
export async function signOutGoogle(): Promise<void> {
  // Expo Go / web: no native module to sign out of — no-op (never load it).
  if (!isNativeGoogleAvailable) return;
  try {
    const { GoogleSignin } = await loadGoogleModule();
    await GoogleSignin.signOut();
  } catch {
    // no-op
  }
}
