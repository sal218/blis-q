import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { Phone } from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { radius, type ThemeColors } from "@/constants/theme";

// The global crisis-help header button (P-37, slice 3b). A circular top-right
// control — a phone-call glyph on a bordered surface pill — that opens the
// "Pomoc w kryzysie" safety page. Shared across the primary screens (Home,
// Events, Wsparcie, Chat, Profile) so its look + a11y label can't drift.
//
// Presentational only: the Crisis screen lives in the Resources stack, so each
// host screen supplies the navigation via `onPress` (same-stack `navigate` on
// Wsparcie; cross-tab `navigate("Resources", { screen: "Crisis" })` elsewhere).

type Props = { onPress: () => void };

export function CrisisHeaderButton({ onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.crisis.open}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Phone size={26} color={colors.primary} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    btn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
