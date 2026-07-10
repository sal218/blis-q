import { useMemo } from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CrisisCategoryIcon, Phone } from "@/components/icons/PhosphorIcons";
import { CRISIS_CATEGORY_COLORS } from "@/constants/crisisCategories";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { CrisisContactDTO } from "@shared/types";

// One crisis contact on the "Pomoc w kryzysie" page (design ref:
// assets/safety-page-*.png): a category-tinted icon disc, the name + phone, an
// optional hours pill, a short description, and a GREEN tap-to-call button. The
// only action is calling — no per-user/identity surface. Article-9-safe.

// Build a tel: URL — digits only, plus a SINGLE leading "+" when the number
// starts with one (an international prefix). Any other "+" is dropped, so a
// display value like "800 70 2222" dials as "tel:800702222" and "+48 22 628"
// dials as "tel:+4822628", while a stray mid-string "+" can't leak through.
export function telUrl(phone: string): string {
  const plus = phone.trimStart().startsWith("+") ? "+" : "";
  return `tel:${plus}${phone.replace(/\D/g, "")}`;
}

type Props = { contact: CrisisContactDTO };

export function CrisisContactCard({ contact }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = CRISIS_CATEGORY_COLORS[contact.category];

  const onCall = () => {
    void Linking.openURL(telUrl(contact.phone));
  };

  return (
    <View style={styles.card}>
      <View style={[styles.iconDisc, { backgroundColor: accent + "1A" }]}>
        <CrisisCategoryIcon
          category={contact.category}
          size={24}
          color={accent}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {contact.name} • {contact.phone}
          </Text>
          {contact.hours ? (
            <View style={styles.hoursPill}>
              <Text style={styles.hoursText} numberOfLines={1}>
                {contact.hours}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {contact.description}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${strings.crisis.callAction}: ${contact.name}`}
        onPress={onCall}
        style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
      >
        <Phone size={22} color="#FFFFFF" />
      </Pressable>
    </View>
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
    iconDisc: {
      width: 52,
      height: 52,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
      gap: 4,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 15.5,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    hoursPill: {
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    hoursText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    description: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 18,
    },
    callBtn: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
