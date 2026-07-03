import { useMemo } from "react";
import { Text, Pressable, View, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryIcon } from "@/components/icons/PhosphorIcons";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventCategory } from "@shared/types";

// A single category chip (slice D2). Three uses share one component:
//  • selectable filter chip (events feed) + selectable picker chip (create form)
//    → pass `onPress`; `selected` drives the soft brand-tint fill.
//  • read-only display chip (EventCard / Event Detail) → omit `onPress`; renders
//    as a static pill (never focusable/pressable).
// When `category` is given the matching Phosphor glyph is shown before the label
// (design ref: assets/events-page-details.jpeg). Labels are Polish.

type Props = {
  label: string;
  category?: EventCategory;
  selected?: boolean;
  onPress?: () => void;
};

export function CategoryChip({
  label,
  category,
  selected = false,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const body = (
    <>
      {category ? (
        <CategoryIcon category={category} size={16} color={colors.primary} />
      ) : null}
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
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
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // Read-only display chip sits inline in content; hugs its own width.
    chipStatic: {
      alignSelf: "flex-start",
      paddingVertical: spacing.xs,
    },
    // Soft brand-tint selected state (matches the create-form mockup): a
    // translucent primary fill + primary border/label, not a heavy solid block.
    // `+ "22"` = ~13% alpha on the 6-digit hex primary (valid in light + dark).
    chipSelected: {
      backgroundColor: colors.primary + "22",
      borderColor: colors.primary,
    },
    pressed: {
      opacity: 0.6,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    labelSelected: {
      color: colors.primary,
    },
  });
}
