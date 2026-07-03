import { useMemo } from "react";
import { Text, Pressable, View, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// A single category chip (slice D2). Three uses share one component:
//  • selectable filter chip (events feed) + selectable picker chip (create form)
//    → pass `onPress`; `selected` drives the brand-tint fill.
//  • read-only display chip (EventCard / Event Detail) → omit `onPress`; renders
//    as a static pill (never focusable/pressable).
// Labels are Polish (strings.events.categories); the chip itself is copy-agnostic.

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function CategoryChip({ label, selected = false, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const body = (
    <Text
      style={[styles.label, selected && styles.labelSelected]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  // Read-only display chip: a static pill, not a button.
  if (!onPress) {
    return <View style={[styles.chip, styles.chipStatic]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // Read-only display chip sits inline in content; a touch smaller feel.
    chipStatic: {
      alignSelf: "flex-start",
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pressed: {
      opacity: 0.6,
    },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    labelSelected: {
      color: "#fff",
    },
  });
}
