import { useEffect } from "react";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

// A single shimmering placeholder block — the primitive every screen skeleton is
// composed from. It pulses opacity between full and dim on a loop. Colour is
// theme-aware (a subtle tint over the surface) so it reads correctly in light
// AND dark without callers passing an isDark flag. Sizes/radius are passed in.

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
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // A neutral tint that sits above the card/surface in both themes.
  const backgroundColor =
    mode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(17,19,31,0.07)";

  return (
    <Animated.View
      testID={testID}
      // Not a11y-relevant: skeletons are transient visual placeholders.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius, backgroundColor },
        style,
        animatedStyle,
      ]}
    />
  );
}
