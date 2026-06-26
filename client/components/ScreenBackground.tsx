import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

// Full-screen static background (design ref: assets/darkmode-background.png).
//
// Light mode: a flat white surface (the mockups are light/white).
// Dark mode: a premium deep-navy -> rich-purple gradient with a soft radial
// glow offset up-and-right, edges kept dark for UI contrast. Built from a
// lightweight 2-rect SVG (a vertical base gradient + a radial glow overlay) so
// there's no large image asset to ship/decode.
//
// Usage: render as the FIRST child of a screen whose own container is
// transparent, so the content sits on top of this. pointerEvents none so it
// never intercepts touches.

export function ScreenBackground() {
  const { colors, mode } = useTheme();
  const { width, height } = useWindowDimensions();

  if (mode !== "dark") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background },
        ]}
        pointerEvents="none"
      />
    );
  }

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
      pointerEvents="none"
    >
      <Defs>
        {/* Base: darkest navy at the top, easing into rich purple at the bottom. */}
        <LinearGradient id="bg-base" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#07091F" />
          <Stop offset="0.55" stopColor="#120A33" />
          <Stop offset="1" stopColor="#1A1148" />
        </LinearGradient>
        {/* Glow: soft purple bloom centered up-and-right, fading to nothing so
            the edges stay dark. objectBoundingBox units (0-1) stretch it to the
            tall aspect ratio, matching the reference. */}
        <RadialGradient id="bg-glow" cx="0.65" cy="0.3" r="0.9">
          <Stop offset="0" stopColor="#4B2E9E" stopOpacity="0.55" />
          <Stop offset="0.55" stopColor="#2A1A63" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#1A1148" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#bg-base)" />
      <Rect x="0" y="0" width={width} height={height} fill="url(#bg-glow)" />
    </Svg>
  );
}
