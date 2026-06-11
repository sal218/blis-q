import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { colors, spacing, radius } from "@/constants/theme";

// Primary call-to-action button. Shows a spinner while `loading` and is
// non-interactive when loading or disabled. `variant="secondary"` is an
// outline style (used for secondary actions on the same screen).

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  accessibilityLabel?: string;
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;
  const isSecondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.text : "#FFFFFF"} />
      ) : (
        <Text style={[styles.label, isSecondary && styles.secondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryLabel: {
    color: colors.text,
  },
});
