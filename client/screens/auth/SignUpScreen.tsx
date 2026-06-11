import { useState } from "react";
import { View, StyleSheet } from "react-native";
import type { AuthScreenProps } from "@/navigation/types";
import { AuthScreen } from "@/components/AuthScreen";
import { TextField } from "@/components/forms/TextField";
import { PasswordField } from "@/components/forms/PasswordField";
import { ConsentList } from "@/components/ConsentList";
import { LegalLinks } from "@/components/LegalLinks";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import { useConsent } from "@/hooks/useConsent";
import { signUp } from "@/lib/api/auth";
import {
  validateEmail,
  validateNewPassword,
  validateDisplayName,
} from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { POLICY_VERSION } from "@/constants/legal";
import { strings } from "@/i18n";
import { spacing } from "@/constants/theme";

export function SignUpScreen({ navigation }: AuthScreenProps<"SignUp">) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const consent = useConsent();

  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setFormError(null);
    const dn = validateDisplayName(displayName);
    const em = validateEmail(email);
    const pw = validateNewPassword(password);
    setDisplayNameError(dn ? fieldErrorMessage(dn) : null);
    setEmailError(em ? fieldErrorMessage(em) : null);
    setPasswordError(pw ? fieldErrorMessage(pw) : null);
    if (dn || em || pw || !consent.isValid) return;

    const normalizedEmail = email.trim().toLowerCase();
    setSubmitting(true);
    const res = await signUp({
      email: normalizedEmail,
      password,
      displayName: displayName.trim(),
      consentedTypes: consent.selected,
      policyVersion: POLICY_VERSION,
    });
    setSubmitting(false);

    if (res.ok) {
      navigation.navigate("CheckEmail", { email: normalizedEmail });
    } else {
      setFormError(apiErrorMessage(res.error));
    }
  }

  return (
    <AuthScreen title={strings.signUp.title} subtitle={strings.signUp.subtitle}>
      <FormError message={formError} />

      <TextField
        label={strings.common.displayName}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={strings.common.displayNamePlaceholder}
        autoCapitalize="words"
        error={displayNameError}
      />
      <TextField
        label={strings.common.email}
        value={email}
        onChangeText={setEmail}
        placeholder={strings.common.emailPlaceholder}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={emailError}
      />
      <PasswordField
        label={strings.common.password}
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        error={passwordError}
      />

      <View style={styles.consent}>
        <ConsentList selected={consent.selected} onToggle={consent.toggle} />
        <LegalLinks />
      </View>

      <PrimaryButton
        label={strings.signUp.submit}
        onPress={onSubmit}
        loading={submitting}
        disabled={!consent.isValid}
      />
      <TextLink
        label={strings.signUp.haveAccount}
        onPress={() => navigation.navigate("Login")}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  consent: {
    marginVertical: spacing.md,
  },
});
