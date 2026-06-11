import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius } from "@/constants/theme";

// Form-level error banner (network/credentials/rate-limit/etc.). Renders nothing
// when there's no message. Announced to screen readers via role="alert".

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
