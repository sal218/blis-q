import { useMemo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CaretRight } from "@/components/icons/PhosphorIcons";
import { spacing, type ThemeColors } from "@/constants/theme";

// One row inside a grouped settings card (icon · label · right slot). The right
// slot is either a caller-supplied element (e.g. the theme toggle) or, when the
// row navigates (onPress set and no custom right), a chevron. Purely
// presentational — behaviour lives in the caller.

interface Props {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  accessibilityLabel?: string;
}

export function SettingsRow({
  icon,
  label,
  onPress,
  right,
  destructive = false,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const rightSlot =
    right ??
    (onPress ? <CaretRight size={18} color={colors.textMuted} /> : null);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        onPress && pressed && styles.pressed,
      ]}
    >
      <View style={styles.icon}>{icon}</View>
      <Text
        style={[styles.label, destructive && styles.labelDestructive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    pressed: {
      opacity: 0.6,
    },
    icon: {
      width: 24,
      alignItems: "center",
    },
    label: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "500",
    },
    labelDestructive: {
      color: colors.danger,
    },
    right: {
      marginLeft: spacing.sm,
    },
  });
}
