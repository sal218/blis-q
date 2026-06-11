import { Pressable, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/constants/theme";

// Inline tappable text link (e.g. "Masz już konto? Zaloguj się"). Centered by
// default; `align` overrides. Used for navigation between auth screens.

type Props = {
  label: string;
  onPress: () => void;
  align?: "center" | "left";
};

export function TextLink({ label, onPress, align = "center" }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.wrap}
    >
      <Text style={[styles.text, { textAlign: align }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.sm,
  },
  text: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
