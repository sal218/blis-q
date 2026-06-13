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
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
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
      paddingVertical: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    segmentActive: {
      borderBottomColor: colors.primary,
    },
    label: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "600",
    },
    labelActive: {
      color: colors.primary,
    },
  });
}
