import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, type ThemeColors } from "@/constants/theme";

// Themed "coming soon" placeholder, centered in its container. Used by the
// not-yet-built tabs/segments (Home, Chat, Events list, Safe places) so the IA
// is in place this slice while the real screens land later.

export function ComingSoon({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.root}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    text: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
  });
}
