import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// A compact error state for a Home rail. A failed first load used to render as
// the empty placeholder ("no communities / no news"), indistinguishable from
// genuine emptiness and only recoverable by a full reload. This card makes a
// failure visible and offers an in-place retry. Reused by all three Home rails.

export function RailError({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card} testID="rail-error">
      <Ionicons
        name="cloud-offline-outline"
        size={26}
        color={colors.textMuted}
      />
      <Text style={styles.text}>{strings.home.loadError}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.home.retry}
        onPress={onRetry}
        style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
      >
        <Text style={styles.retryText}>{strings.home.retry}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      alignItems: "center",
      gap: spacing.sm,
      ...shadow,
    },
    text: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
    },
    retryBtn: {
      marginTop: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pressed: { opacity: 0.7 },
    retryText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "700",
    },
  });
}
