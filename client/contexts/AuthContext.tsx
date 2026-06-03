import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getStoredToken, clearStoredToken } from "@/lib/auth";

// Minimal auth state for the shell: tracks whether a session token is present.
// The full profile fetch (GET the authenticated user) is wired when the auth
// API routes are built in Sprint 1. Until then isAuthenticated is derived from
// token presence, which is enough to drive navigation and push registration.

type AuthContextValue = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setToken(await getStoredToken());
      setIsLoading(false);
    })();
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredToken();
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, isLoading, isAuthenticated: !!token, signOut }}
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
