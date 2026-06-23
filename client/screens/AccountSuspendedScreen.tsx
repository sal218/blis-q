import { useMemo } from "react";
import { View, Text, Linking, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_CONFIGURED } from "@/constants/support";

// Full-screen suspension notice (P-20). Rendered by RootNavigator (above the
// auth/app trees) when the account is suspended — after a banned user logs in or
// any authenticated request returns 403 account_suspended. The session has
// already been cleared by the global suspension handler; this screen only
// explains the state, offers a v1 appeal-by-email contact (when configured), and
// a way back to the login screen. Calm, non-shaming copy by design.

export function AccountSuspendedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { dismissSuspended } = useAuth();

  const onAppeal = () => {
    // Best-effort; if no mail client handles it, nothing happens (no crash).
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <View style={styles.center}>
        <Text style={styles.title}>{strings.accountSuspended.title}</Text>
        <Text style={styles.body}>{strings.accountSuspended.body}</Text>
      </View>

      <View style={styles.actions}>
        {SUPPORT_EMAIL_CONFIGURED ? (
          <PrimaryButton
            label={strings.accountSuspended.appeal}
            onPress={onAppeal}
          />
        ) : (
          <Text style={styles.muted}>
            {strings.accountSuspended.appealUnavailable}
          </Text>
        )}
        <View style={styles.backButton}>
          <PrimaryButton
            label={strings.accountSuspended.backToLogin}
            variant="secondary"
            onPress={dismissSuspended}
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      justifyContent: "space-between",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: spacing.md,
    },
    body: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
    },
    actions: {
      gap: spacing.sm,
    },
    backButton: {
      marginTop: spacing.sm,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: spacing.sm,
    },
  });
}
