import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Form-level error banner (network/credentials/rate-limit/etc.). Renders nothing
// when there's no message. Announced to screen readers via role="alert".

export function FormError({ message }: { message?: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: "rgba(220, 38, 38, 0.12)",
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    text: {
      color: colors.danger,
      fontSize: 14,
    },
  });
}
