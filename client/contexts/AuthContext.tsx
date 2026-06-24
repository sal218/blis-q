import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { AccountProfile, SessionResponse } from "@shared/types";
import {
  loadSession,
  saveSession,
  clearSession,
  refreshSession,
} from "@/lib/session";
import {
  registerSuspendedHandler,
  bumpSuspensionGeneration,
  registerRefreshHandler,
  registerSessionExpiredHandler,
} from "@/lib/api/http";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { signOutGoogle } from "@/lib/googleAuth";

// App-wide auth state. On launch it rehydrates the persisted session from
// SecureStore (no network — there's no GET /me endpoint yet, tracker P-1) and
// exposes the profile plus signIn/signOut. `isAuthenticated` drives the root
// navigator (auth stack vs app) and push-token registration.
//
// signIn is called with the SessionResponse from signup/login/google; it
// persists tokens + profile and flips the app into the authenticated tree.

type AuthContextValue = {
  user: AccountProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // True when the account is suspended (banned). Overrides the auth/app trees in
  // RootNavigator to show the suspension screen. Set by the global suspension
  // handler (a 403 account_suspended on login or any authenticated request).
  isSuspended: boolean;
  // True when a session expired and an automatic token refresh failed (P-10):
  // the user has been signed out and the login screen shows a "session expired"
  // notice. Cleared on the next successful signIn.
  sessionExpired: boolean;
  signIn: (session: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
  // Leave the suspension screen (back to login). Bumps the suspension generation
  // so any late 403 from the now-dead session can't re-show it.
  dismissSuspended: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      setUser(stored?.user ?? null);
      setIsLoading(false);
    })();
  }, []);

  // Register the global force-logout handler the HTTP layer calls when a request
  // returns 403 account_suspended. Each cleanup step is best-effort — we must
  // ALWAYS end in the suspended state. deregisterPushToken runs first (while a
  // token may still be attached); its backend route isn't built yet so the
  // network call is currently a no-op, but it still clears the local token.
  useEffect(() => {
    registerSuspendedHandler(async () => {
      try {
        await deregisterPushToken();
      } catch {
        // ignore
      }
      try {
        await signOutGoogle();
      } catch {
        // ignore
      }
      try {
        await clearSession();
      } catch {
        // ignore
      }
      setUser(null);
      setIsSuspended(true);
    });

    // P-10: when an authenticated request 401s, the HTTP layer asks for a token
    // refresh; if it fails, it fires the expired-session handler. Bump the
    // suspension generation FIRST (session boundary) so a stale in-flight 403
    // can't flip the UX into the suspended state after we've expired the session.
    registerRefreshHandler(() => refreshSession());
    registerSessionExpiredHandler(async () => {
      bumpSuspensionGeneration();
      try {
        await clearSession();
      } catch {
        // ignore
      }
      setUser(null);
      setSessionExpired(true);
    });

    return () => {
      registerSuspendedHandler(null);
      registerRefreshHandler(null);
      registerSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback(async (session: SessionResponse) => {
    bumpSuspensionGeneration(); // new session boundary — invalidate stale 403s
    await saveSession(session);
    setUser(session.user);
    setIsSuspended(false);
    setSessionExpired(false);
  }, []);

  const signOut = useCallback(async () => {
    bumpSuspensionGeneration(); // boundary — a late suspended 403 must not show
    await clearSession();
    setUser(null);
  }, []);

  const dismissSuspended = useCallback(() => {
    bumpSuspensionGeneration();
    setIsSuspended(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isSuspended,
        sessionExpired,
        signIn,
        signOut,
        dismissSuspended,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
