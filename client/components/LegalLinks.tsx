import { useMemo } from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { LEGAL_URLS, LEGAL_LINKS_CONFIGURED } from "@/constants/legal";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Tappable Terms + Privacy links for the consent surfaces. The required consent
// says the user accepts these documents, so they must be reachable from the
// consent UI (GDPR explicit consent). Until a real web base URL is configured
// (provisioning), we show an honest "available before launch" note instead of
// dead links to a relative path.
//
// `configured`/`urls` default to the constants; they're injectable so the
// component is testable in both states without mocking the env.

type Props = {
  configured?: boolean;
  urls?: { terms: string; privacy: string };
};

export function LegalLinks({
  configured = LEGAL_LINKS_CONFIGURED,
  urls = LEGAL_URLS,
}: Props = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!configured) {
    return (
      <Text style={styles.unavailable}>{strings.consent.legalUnavailable}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>{strings.consent.legalIntro}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(urls.terms)}
          hitSlop={6}
        >
          <Text style={styles.link}>{strings.consent.terms}</Text>
        </Pressable>
        <Text style={styles.sep}>·</Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(urls.privacy)}
          hitSlop={6}
        >
          <Text style={styles.link}>{strings.consent.privacy}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.sm,
    },
    intro: {
      color: colors.textMuted,
      fontSize: 13,
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    link: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
    sep: {
      color: colors.textMuted,
      marginHorizontal: spacing.sm,
    },
    unavailable: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: spacing.sm,
    },
  });
}
