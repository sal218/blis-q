// Blis-Q brand tokens — deep indigo / violet, clean and minimal. This is NOT
// the Even Tab glass system (blur/aurora/shimmer were intentionally not ported).
// Pride theming is applied only in June and will be layered on separately.

export const colors = {
  primary: "#4F46E5", // indigo
  primaryDark: "#4338CA",
  accent: "#7C3AED", // violet
  background: "#0B1021",
  surface: "#161B2E",
  text: "#F5F5F7",
  textMuted: "#9CA3AF",
  border: "#262C40",
  danger: "#DC2626",
  success: "#10B981",
} as const;

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
