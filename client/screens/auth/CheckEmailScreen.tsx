import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import type { AuthScreenProps } from "@/navigation/types";
import { AuthScreen } from "@/components/AuthScreen";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import { resendVerification } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/messages";
import { strings, format } from "@/i18n";
import { colors, spacing } from "@/constants/theme";

// Post-signup: tells the user to verify by email, with a rate-limit-aware resend.
// Verification-first — there is no session yet; the user logs in after verifying.

export function CheckEmailScreen({
  navigation,
  route,
}: AuthScreenProps<"CheckEmail">) {
  const { email } = route.params;
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onResend() {
    setFormError(null);
    setResent(false);
    setResending(true);
    const res = await resendVerification(email);
    setResending(false);
    if (res.ok) setResent(true);
    else setFormError(apiErrorMessage(res.error));
  }

  return (
    <AuthScreen title={strings.checkEmail.title}>
      <Text style={styles.body}>
        {format(strings.checkEmail.body, { email })}
      </Text>

      <FormError message={formError} />
      {resent && (
        <Text style={styles.resent} accessibilityRole="alert">
          {strings.checkEmail.resent}
        </Text>
      )}

      <PrimaryButton
        label={strings.checkEmail.resend}
        onPress={onResend}
        loading={resending}
      />
      <TextLink
        label={strings.checkEmail.backToLogin}
        onPress={() => navigation.navigate("Login")}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  resent: {
    color: colors.success,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
