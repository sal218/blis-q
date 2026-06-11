import { View, Text, Pressable, StyleSheet } from "react-native";
import { strings } from "@/i18n";
import { colors, spacing, radius } from "@/constants/theme";

// A single consent row: a tappable checkbox + label. Consent must be explicit
// and affirmative — these are NEVER pre-ticked by default (COMPLIANCE §5.1).
// `required` shows a small "wymagane" badge; the parent enforces the actual gate
// (isConsentValid) and submission rules.

type Props = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  required?: boolean;
};

export function ConsentCheckbox({
  label,
  checked,
  onToggle,
  required = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={styles.row}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Text style={styles.check}>✓</Text>}
      </View>
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
        {required && (
          <Text style={styles.badge}>{strings.consent.requiredBadge}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  check: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  labelWrap: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
