import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, type ThemeColors } from "@/constants/theme";

// Text-tab segmented control (active segment underlined in the brand colour),
// matching the Events-section mockups. State is owned by the parent: pass the
// labels, the selected index, and an onChange handler.

type Props = {
  segments: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
};

export function SegmentedControl({ segments, selectedIndex, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {segments.map((label, index) => {
        const active = index === selectedIndex;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => onChange(index)}
            style={styles.segment}
          >
            {/* The active underline hugs the label text (not the full segment
                width) — a thinner, more premium indicator. */}
            <View style={[styles.labelWrap, active && styles.labelWrapActive]}>
              <Text
                style={[styles.label, active && styles.labelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingTop: spacing.md,
    },
    // Wraps just the label so the active underline is text-width, not
    // segment-width. Carries the bottom border + the gap under the text.
    labelWrap: {
      paddingBottom: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    labelWrapActive: {
      borderBottomColor: colors.primary,
    },
    label: {
      color: colors.textMuted,
      // Uniform across all three segments — sized so the longest label
      // ("Bezpieczne miejsca") stays on one line on narrow phones, instead of
      // per-label auto-shrink (which made that one tab visibly smaller).
      fontSize: 14,
      fontWeight: "600",
    },
    labelActive: {
      color: colors.primary,
    },
  });
}
