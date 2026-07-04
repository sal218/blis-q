// Blis-Q design tokens. The app ships BOTH light and dark mode (user toggles in
// Profile — see ThemeContext). The two palettes share an identical shape so every
// component is palette-agnostic: read colours from `useTheme()`, never import a
// palette directly into a component.
//
// LIGHT was sampled from the v1 mockups (assets/event-communities-*, home-screen,
// profile-screen): white surfaces, near-black text, a vibrant brand purple for
// accents/active nav/links/CTAs, light-grey cards & borders.
// DARK is the brand-purple-dark variant (there is no dark mockup yet — per Sal,
// "dark mode makes the background that specific shade of purple"); refine these
// once a dark mockup exists. Token SHAPE must stay identical to LIGHT.

export type ThemeColors = {
  primary: string; // brand purple — primary CTAs, active nav, links
  primaryDark: string; // pressed/darker primary
  accent: string; // secondary violet accent
  background: string; // screen background
  surface: string; // inputs, chips, subtly-raised fills
  card: string; // elevated content card (white in light; raised in dark)
  text: string; // primary text
  textMuted: string; // secondary/labels
  border: string; // hairlines, input borders
  danger: string; // errors/destructive
  success: string; // confirmations
};

export const lightColors: ThemeColors = {
  primary: "#6D4AFF",
  primaryDark: "#5A3FE0",
  accent: "#7C3AED",
  background: "#FFFFFF",
  surface: "#F3F2F9",
  card: "#FFFFFF",
  text: "#15131F",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  danger: "#DC2626",
  success: "#10B981",
};

export const darkColors: ThemeColors = {
  primary: "#8B73FF",
  primaryDark: "#6D4AFF",
  accent: "#A78BFA",
  background: "#16122E", // brand-purple-dark
  surface: "#221B42",
  card: "#1E1A3E", // raised soft-glass card, a touch above the page
  text: "#F5F5F7",
  textMuted: "#A9A4C0",
  border: "#332A55",
  danger: "#F87171",
  success: "#34D399",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

// Soft elevation for cards (the modern, airy look in the mockups). iOS reads the
// shadow* props; Android reads elevation. Apply to surfaces that should "lift"
// off the background (home sections, content cards).
export const shadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
