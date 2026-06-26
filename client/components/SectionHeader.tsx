import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Reusable "section title + optional See all" header (design ref: the home and
// profile mockups, where it repeats across every section). The "See all" link is
// rendered only when `onSeeAll` is provided. Pure presentation.

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.home.seeAll}
          onPress={onSeeAll}
          hitSlop={8}
        >
          <Text style={styles.seeAll}>{strings.home.seeAll}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
    seeAll: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
