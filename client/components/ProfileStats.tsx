import { Fragment, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, type ThemeColors } from "@/constants/theme";

// A row of profile stat cells (value + label), divider-separated — the
// "12 Communities · 8 Events" strip from the design ref. Reusable but currently
// UNMOUNTED (ProfileScreen gates it behind SHOW_STATS=false): the real counts
// aren't wired yet and we do NOT show fabricated numbers. When enabled it will
// carry Communities + Events only — Blis-Q has no friend graph, so no
// "Connections". Renders nothing when given no stats.

export type ProfileStat = { value: string; label: string };

interface Props {
  stats: ProfileStat[];
}

export function ProfileStats({ stats }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (stats.length === 0) return null;

  return (
    <View style={styles.root} testID="profile-stats">
      {stats.map((stat, i) => (
        <Fragment key={stat.label}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.cell}>
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flexDirection: "row",
      alignItems: "center",
    },
    cell: {
      flex: 1,
      alignItems: "center",
    },
    value: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
    },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
  });
}
