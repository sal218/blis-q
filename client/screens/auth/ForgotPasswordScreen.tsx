import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import type { AuthScreenProps } from "@/navigation/types";
import { AuthScreen } from "@/components/AuthScreen";
import { TextField } from "@/components/forms/TextField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import { forgotPassword } from "@/lib/api/auth";
import { validateEmail } from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import { colors, spacing } from "@/constants/theme";

// Enumeration-resistant: any valid email yields the same "if an account exists…"
// confirmation. We never reveal whether the address is registered.

export function ForgotPasswordScreen({
  navigation,
}: AuthScreenProps<"ForgotPassword">) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit() {
    setFormError(null);
    const em = validateEmail(email);
    setEmailError(em ? fieldErrorMessage(em) : null);
    if (em) return;

    setSubmitting(true);
    const res = await forgotPassword(email.trim().toLowerCase());
    setSubmitting(false);

    if (res.ok) setDone(true);
    else setFormError(apiErrorMessage(res.error));
  }

  return (
    <AuthScreen
      title={strings.forgotPassword.title}
      subtitle={strings.forgotPassword.subtitle}
    >
      {done ? (
        <Text style={styles.done} accessibilityRole="alert">
          {strings.forgotPassword.done}
        </Text>
      ) : (
        <>
          <FormError message={formError} />
          <TextField
            label={strings.common.email}
            value={email}
            onChangeText={setEmail}
            placeholder={strings.common.emailPlaceholder}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={emailError}
            onSubmitEditing={onSubmit}
            returnKeyType="send"
          />
          <PrimaryButton
            label={strings.forgotPassword.submit}
            onPress={onSubmit}
            loading={submitting}
          />
        </>
      )}

      <TextLink
        label={strings.forgotPassword.backToLogin}
        onPress={() => navigation.navigate("Login")}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  done: {
    color: colors.success,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
});
