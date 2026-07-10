import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Loading placeholder for the Chat inbox (ChatInboxScreen): a header (title +
// search bar) followed by avatar rows — a circular avatar + a name line + a
// preview line, with the same inset hairline separators as the real list.

const AVATAR_SIZE = 52;

// Deterministic per-row width cycles so the rows look varied but renders stay
// stable (never Math.random).
const NAME_WIDTHS = [140, 110, 165, 125, 150, 100, 135];
const PREVIEW_WIDTHS = [220, 180, 240, 160, 200, 150, 210];

interface Props {
  count?: number;
  // When the host screen already renders the real header (e.g. so a persistent
  // crisis-help button stays visible during load), omit the skeleton's own
  // placeholder header to avoid a doubled header.
  showHeader?: boolean;
}

export function ChatInboxSkeleton({ count = 7, showHeader = true }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.root} testID="chat-inbox-skeleton">
      {showHeader ? (
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <SkeletonBlock height={26} width={150} borderRadius={6} />
          <SkeletonBlock
            height={44}
            borderRadius={radius.md}
            style={styles.search}
          />
        </View>
      ) : null}

      <View style={styles.list}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i}>
            <View testID="chat-inbox-skeleton-row" style={styles.row}>
              <SkeletonBlock
                height={AVATAR_SIZE}
                width={AVATAR_SIZE}
                borderRadius={radius.full}
              />
              <View style={styles.rowBody}>
                <SkeletonBlock
                  height={14}
                  width={NAME_WIDTHS[i % NAME_WIDTHS.length]}
                  borderRadius={4}
                />
                <SkeletonBlock
                  height={12}
                  width={PREVIEW_WIDTHS[i % PREVIEW_WIDTHS.length]}
                  borderRadius={4}
                  style={styles.preview}
                />
              </View>
            </View>
            {i < count - 1 ? <View style={styles.separator} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    search: {
      marginTop: spacing.md,
    },
    list: {
      paddingHorizontal: spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    rowBody: {
      flex: 1,
      marginLeft: spacing.md,
    },
    preview: {
      marginTop: spacing.sm,
    },
    // Same inset hairline as the real inbox (starts under the text, past avatar).
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: AVATAR_SIZE + spacing.md,
    },
  });
}
