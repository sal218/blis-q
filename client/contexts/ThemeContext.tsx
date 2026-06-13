import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as SecureStore from "expo-secure-store";
import { lightColors, darkColors, type ThemeColors } from "@/constants/theme";

// Theme state. Blis-Q ships light + dark; the user toggles in Profile. Every
// screen/component reads `colors` from here (never a static palette import), so
// a mode change re-renders the whole tree.
//
// Persistence: the chosen mode is saved in SecureStore (key blis-q.theme-mode).
// First paint is DETERMINISTIC — `mode` starts at the default ("dark") and the
// persisted preference is applied async on mount. `isReady` flips true once the
// stored value has been read (callers/tests can wait on it).

type ThemeMode = "dark" | "light";

const THEME_KEY = "blis-q.theme-mode";
const DEFAULT_MODE: ThemeMode = "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isReady: boolean; // true once the persisted mode has been read
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function persist(mode: ThemeMode): void {
  SecureStore.setItemAsync(THEME_KEY, mode).catch(() => {
    // Non-fatal — the in-memory mode still applies for this session.
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(THEME_KEY);
        if (active && (saved === "light" || saved === "dark")) {
          setModeState(saved);
        }
      } catch {
        // Unreadable store → keep the default.
      } finally {
        if (active) setIsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    persist(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  const colors = mode === "dark" ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{ mode, colors, isReady, setMode, toggleMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
