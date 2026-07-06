import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// A list of card-shaped loading placeholders, shown on the INITIAL load of the
// browse lists (Communities / Safe Places / Events) in place of a bare spinner.
// Two silhouettes:
//   • "card"  — a left rounded thumbnail + title/meta/description lines + a right
//                action block (mirrors CommunityCard / SafePlaceCard).
//   • "event" — a left date column + a hairline divider + stacked metadata rows
//                (mirrors EventCard's date-column layout).
// `showSearch` prepends a search-bar-shaped block for the screens that render the
// skeleton before their real search box. Line widths are a fixed, deterministic
// cycle (never Math.random) so rows look varied but renders stay stable.

type Variant = "card" | "event";

interface Props {
  count?: number;
  variant?: Variant;
  showSearch?: boolean;
  // When the parent already applies the list's horizontal/top padding (e.g.
  // CommunitiesSection renders this inside its padded root), pass false so the
  // skeleton cards don't get double-indented. The early-return screens
  // (SafePlaces/Events) render it as the whole body → keep the default.
  padded?: boolean;
}

// Deterministic per-row width cycles so the placeholders don't look uniform.
const TITLE_WIDTHS = [150, 120, 165, 135, 110, 145];
const META_WIDTHS = [90, 70, 100, 80, 65, 95];

export function CardListSkeleton({
  count = 6,
  variant = "card",
  showSearch = false,
  padded = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[styles.root, padded && styles.rootPadded]}
      testID="card-list-skeleton"
    >
      {showSearch ? (
        <SkeletonBlock
          height={48}
          borderRadius={radius.lg}
          style={styles.search}
        />
      ) : null}

      {Array.from({ length: count }).map((_, i) =>
        variant === "event" ? (
          <View key={i} testID="skeleton-card" style={styles.card}>
            <View style={styles.dateCol}>
              <SkeletonBlock height={10} width={32} borderRadius={4} />
              <SkeletonBlock
                height={22}
                width={28}
                borderRadius={6}
                style={styles.gapTop}
              />
              <SkeletonBlock
                height={10}
                width={40}
                borderRadius={4}
                style={styles.gapTop}
              />
            </View>
            <View style={styles.vDivider} />
            <View style={styles.content}>
              <SkeletonBlock
                height={16}
                width={TITLE_WIDTHS[i % 6]}
                borderRadius={4}
              />
              <SkeletonBlock
                height={12}
                width={META_WIDTHS[i % 6]}
                borderRadius={4}
                style={styles.gapTop}
              />
              <SkeletonBlock
                height={12}
                width={META_WIDTHS[(i + 2) % 6]}
                borderRadius={4}
                style={styles.gapTop}
              />
              <SkeletonBlock
                height={22}
                width={72}
                borderRadius={radius.full}
                style={styles.tag}
              />
            </View>
          </View>
        ) : (
          <View key={i} testID="skeleton-card" style={styles.card}>
            <SkeletonBlock height={68} width={68} borderRadius={radius.md} />
            <View style={styles.content}>
              <SkeletonBlock
                height={16}
                width={TITLE_WIDTHS[i % 6]}
                borderRadius={4}
              />
              <SkeletonBlock
                height={12}
                width={META_WIDTHS[i % 6]}
                borderRadius={4}
                style={styles.gapTop}
              />
              <SkeletonBlock
                height={12}
                width="88%"
                borderRadius={4}
                style={styles.gapTop}
              />
            </View>
            <SkeletonBlock height={30} width={72} borderRadius={radius.full} />
          </View>
        ),
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    rootPadded: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    search: {
      marginBottom: spacing.md,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadow,
      shadowOpacity: 0.05,
    },
    content: {
      flex: 1,
    },
    gapTop: {
      marginTop: spacing.sm,
    },
    tag: {
      marginTop: spacing.md,
    },
    dateCol: {
      alignItems: "center",
      width: 48,
    },
    vDivider: {
      width: 1,
      alignSelf: "stretch",
      backgroundColor: colors.border,
    },
  });
}
