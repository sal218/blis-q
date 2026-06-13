import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Blocked-users screen. PR 1 (theme foundation) only establishes the entry point
// from Profile; the actual list + unblock is built in feat/communities-mobile
// (PR 2). Kept minimal so navigation from Profile has a destination.

export function BlockedUsersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.root}>
      <Text style={styles.body}>{strings.communities.comingSoon}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.lg,
    },
    body: {
      color: colors.textMuted,
      fontSize: 15,
    },
  });
}
