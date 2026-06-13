import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Placeholder for the Communities tab. The real browse/detail/create screens
// land in feat/communities-mobile (PR 2); this PR only establishes the themed
// tab shell, so the tab has a destination.

export function CommunitiesPlaceholderScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{strings.communities.tabTitle}</Text>
      <Text style={styles.body}>{strings.communities.comingSoon}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
    },
    body: {
      color: colors.textMuted,
      fontSize: 15,
      marginTop: spacing.sm,
    },
  });
}
