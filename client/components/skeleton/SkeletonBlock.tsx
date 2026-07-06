import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";

// A single shimmering placeholder block — the primitive every screen skeleton is
// composed from. It pulses opacity between full and dim on a loop, using RN's
// core Animated (useNativeDriver) — deliberately NOT reanimated, so it needs no
// native module / dev-client rebuild. Colour is theme-aware (a subtle tint over
// the surface) so it reads correctly in light AND dark without an isDark flag.
// Sizes/radius are passed in.

type SkeletonBlockProps = {
  height: number;
  width?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SkeletonBlock({
  height,
  width = "100%",
  borderRadius = 8,
  style,
  testID,
}: SkeletonBlockProps) {
  const { mode } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  // A neutral tint that sits above the card/surface in both themes.
  const backgroundColor =
    mode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(17,19,31,0.07)";

  return (
    <Animated.View
      testID={testID}
      // Not a11y-relevant: skeletons are transient visual placeholders.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius, backgroundColor, opacity }, style]}
    />
  );
}
