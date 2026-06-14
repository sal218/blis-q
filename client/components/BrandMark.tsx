import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { type ThemeColors } from "@/constants/theme";

// The Blis-Q logo mark: two overlapping rounded petals leaning together into a
// soft heart, lighter petal behind, brand-purple petal in front. Built from
// Views so it follows the theme and needs no asset. (A real exported logo asset
// would sharpen fidelity — swap this out when design provides one.)

export function BrandMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);
  return (
    <View
      style={styles.container}
      accessibilityRole="image"
      accessibilityLabel="Blis-Q"
    >
      <View style={[styles.petal, styles.petalBack]} />
      <View style={[styles.petal, styles.petalFront]} />
    </View>
  );
}

function createStyles(colors: ThemeColors, size: number) {
  const petalW = size * 0.56;
  const petalH = size * 0.72;
  return StyleSheet.create({
    container: {
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
    },
    petal: {
      position: "absolute",
      width: petalW,
      height: petalH,
      borderRadius: petalW / 2,
      top: size * 0.1,
    },
    petalBack: {
      left: size * 0.08,
      backgroundColor: colors.accent,
      transform: [{ rotate: "-20deg" }],
    },
    petalFront: {
      right: size * 0.08,
      backgroundColor: colors.primary,
      transform: [{ rotate: "20deg" }],
    },
  });
}
