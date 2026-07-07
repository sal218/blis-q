import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ResourceCategoryIcon,
  CaretRight,
} from "@/components/icons/PhosphorIcons";
import { RESOURCE_CATEGORY_COLORS } from "@/constants/resourceCategories";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { ResourceDTO } from "@shared/types";

// One resource in the Resources feature (P-37, design ref:
// assets/profile-resources.png) — a raised row: a category-tinted icon disc on
// the left, then the title and a two-line snippet of the body, with a chevron.
// The whole card taps through to the detail screen; it NEVER opens the external
// link directly (safer for a vulnerable audience — they see context first).
// Resources have no image (deferred, P-37), so the icon disc is the visual.

type Props = {
  resource: ResourceDTO;
  onPress?: (resource: ResourceDTO) => void;
};

export function ResourceCard({ resource, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = RESOURCE_CATEGORY_COLORS[resource.category];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress ? () => onPress(resource) : undefined}
      style={({ pressed }) => [
        styles.card,
        onPress && pressed && styles.cardPressed,
      ]}
    >
      <View
        testID="resource-icon"
        style={[styles.iconDisc, { backgroundColor: accent + "1A" }]}
      >
        <ResourceCategoryIcon
          category={resource.category}
          size={24}
          color={accent}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {resource.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {resource.body}
        </Text>
      </View>

      <CaretRight size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadow,
      shadowOpacity: 0.06,
    },
    cardPressed: {
      opacity: 0.85,
    },
    iconDisc: {
      width: 52,
      height: 52,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    body: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
