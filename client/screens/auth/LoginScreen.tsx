import { useState } from "react";
import type { AuthScreenProps } from "@/navigation/types";
import { AuthScreen } from "@/components/AuthScreen";
import { TextField } from "@/components/forms/TextField";
import { PasswordField } from "@/components/forms/PasswordField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import { useAuth } from "@/contexts/AuthContext";
import { login } from "@/lib/api/auth";
import { validateEmail, isNonEmpty } from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";

export function LoginScreen({ navigation }: AuthScreenProps<"Login">) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setFormError(null);
    const em = validateEmail(email);
    // Login never hints the password policy — just require a non-empty value.
    const pwMissing = !isNonEmpty(password);
    setEmailError(em ? fieldErrorMessage(em) : null);
    setPasswordError(pwMissing ? strings.errors.invalidCredentials : null);
    if (em || pwMissing) return;

    setSubmitting(true);
    const res = await login(email.trim().toLowerCase(), password);
    setSubmitting(false);

    if (res.ok) {
      // Persist + flip into the authenticated tree (RootNavigator swaps stacks).
      await signIn(res.data);
    } else {
      setFormError(apiErrorMessage(res.error));
    }
  }

  function onNeedVerify() {
    const em = validateEmail(email);
    if (em) {
      setEmailError(fieldErrorMessage(em));
      return;
    }
    navigation.navigate("CheckEmail", { email: email.trim().toLowerCase() });
  }

  return (
    <AuthScreen title={strings.login.title} subtitle={strings.login.subtitle}>
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
      />
      <PasswordField
        label={strings.common.password}
        value={password}
        onChangeText={setPassword}
        textContentType="password"
        error={passwordError}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />

      <PrimaryButton
        label={strings.login.submit}
        onPress={onSubmit}
        loading={submitting}
      />

      <TextLink
        label={strings.login.forgotPassword}
        onPress={() => navigation.navigate("ForgotPassword")}
      />
      <TextLink label={strings.login.needVerify} onPress={onNeedVerify} />
      <TextLink
        label={strings.login.noAccount}
        onPress={() => navigation.navigate("SignUp")}
      />
    </AuthScreen>
  );
}
