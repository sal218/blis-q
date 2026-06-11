import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { AccountProfile, SessionResponse } from "@shared/types";
import { loadSession, saveSession, clearSession } from "@/lib/session";

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
  signIn: (session: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      setUser(stored?.user ?? null);
      setIsLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (session: SessionResponse) => {
    await saveSession(session);
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
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
