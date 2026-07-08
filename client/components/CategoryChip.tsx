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
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDark = mode === "dark";

  // A read-only display chip (no onPress) always reads as "active" soft lavender;
  // an interactive chip only does so when `selected`.
  const soft = selected || !onPress;

  const body = (
    <>
      {category ? (
        <CategoryIcon category={category} size={16} color={colors.primary} />
      ) : null}
      <Text
        style={[
          styles.label,
          soft && styles.labelSoft,
          soft && isDark && styles.labelSoftDark,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  // Read-only display chip: a static pill, not a button.
  if (!onPress) {
    return (
      <View
        style={[
          styles.chip,
          styles.chipSoft,
          isDark && styles.chipSoftDark,
          styles.chipStatic,
        ]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSoft,
        selected && isDark && styles.chipSoftDark,
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
    // Soft brand-tint fill (matches the mockup): a translucent primary fill +
    // primary border/label, not a heavy solid block. `+ "22"` / `+ "1A"` are
    // hex alpha suffixes on the 6-digit primary (valid in light + dark).
    chipSoft: {
      backgroundColor: colors.primary + "22",
      borderColor: colors.primary + "55",
    },
    // Dark mode: a refined translucent violet pill (matches the premium Home
    // cards). Light mode keeps the primary tint above.
    chipSoftDark: {
      backgroundColor: "rgba(124,92,255,0.18)",
      borderColor: "rgba(167,139,250,0.28)",
    },
    pressed: {
      opacity: 0.6,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    labelSoft: {
      color: colors.primary,
    },
    labelSoftDark: {
      color: "#A78BFA",
    },
  });
}
