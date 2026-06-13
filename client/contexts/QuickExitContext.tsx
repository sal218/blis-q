import React, { createContext, useContext, useState, useCallback } from "react";
import { Linking } from "react-native";

// Quick-exit is a first-class SAFETY feature, not an afterthought — it must be
// reachable from every screen (COMPLIANCE/TRANSFER §5.4). This context exposes
// triggerQuickExit() down the whole tree so any screen can fire it.
//
// Implementation rules (CLAUDE.md "Quick-Exit" gotcha):
//   • Flip a root-level overlay from display:'none' to display:'flex' — no
//     animation (any entrance animation is a visible tell).
//   • Never use navigation.navigate() (async) or a Modal (animates).
//   • Also attempt to leave the app entirely for a neutral site — the strongest
//     mask. The overlay is the instant in-app fallback if that can't open.

type QuickExitContextValue = {
  isExitActive: boolean;
  triggerQuickExit: () => void;
  dismissQuickExit: () => void;
};

const QuickExitContext = createContext<QuickExitContextValue | null>(null);

const NEUTRAL_URL = "https://www.google.com";

export function QuickExitProvider({ children }: { children: React.ReactNode }) {
  const [isExitActive, setIsExitActive] = useState(false);

  const triggerQuickExit = useCallback(() => {
    setIsExitActive(true);
    Linking.openURL(NEUTRAL_URL).catch(() => {
      // Browser couldn't open — the neutral overlay still masks the app.
    });
  }, []);

  const dismissQuickExit = useCallback(() => setIsExitActive(false), []);

  return (
    <QuickExitContext.Provider
      value={{ isExitActive, triggerQuickExit, dismissQuickExit }}
    >
      {children}
    </QuickExitContext.Provider>
  );
}

export function useQuickExit(): QuickExitContextValue {
  const ctx = useContext(QuickExitContext);
  if (!ctx) {
    throw new Error("useQuickExit must be used within a QuickExitProvider");
  }
  return ctx;
}
