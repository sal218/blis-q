import { useMemo } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { SocialButton } from "@/components/forms/SocialButton";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// "or continue with" divider + the Apple/Google social buttons (design ref:
// login-screen.png). Google uses the real flow (passed in). Apple is not
// implemented yet (tracker P-12) — instead of a silent no-op, tapping it tells
// the user it's coming, and the button stays visible to match the design.

interface LoginSocialButtonsProps {
  onGoogle: () => void;
  googleLoading: boolean;
}

export function LoginSocialButtons({
  onGoogle,
  googleLoading,
}: LoginSocialButtonsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{strings.login.orContinue}</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialRow}>
        <SocialButton
          provider="apple"
          label={strings.login.continueWithApple}
          onPress={() => Alert.alert(strings.login.appleUnavailable)}
        />
        <View style={styles.gap} />
        <SocialButton
          provider="google"
          label={strings.login.continueWithGoogle}
          onPress={onGoogle}
          loading={googleLoading}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textMuted,
      fontSize: 13,
      marginHorizontal: spacing.md,
    },
    socialRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    gap: {
      width: spacing.md,
    },
  });
}
