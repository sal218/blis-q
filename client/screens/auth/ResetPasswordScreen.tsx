import { useEffect, useMemo, useRef, useState } from "react";
import { Text, Platform, StyleSheet } from "react-native";
import type { AuthScreenProps } from "@/navigation/types";
import { AuthScreen } from "@/components/AuthScreen";
import { PasswordField } from "@/components/forms/PasswordField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import { useTheme } from "@/contexts/ThemeContext";
import { resetPassword } from "@/lib/api/auth";
import { validateNewPassword } from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Reached via the reset deep link (blisq://reset-password?token=…). P-9: the
// token is captured ONCE into a ref and immediately scrubbed from the navigation
// state (and the web URL/history). It is never logged, never put in analytics,
// and never persisted — it travels only in the reset-password request body.

export function ResetPasswordScreen({
  navigation,
  route,
}: AuthScreenProps<"ResetPassword">) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tokenRef = useRef<string | null>(route.params?.token ?? null);
  const [hasToken] = useState(() => !!route.params?.token);

  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!route.params?.token) return;
    // Scrub the token from retained navigation state so it can't linger/leak.
    navigation.setParams({ token: undefined });
    // On web, also strip it from the URL/history (no Referer/analytics leak).
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        // no-op — best effort
      }
    }
    // Capture-once on mount; deliberately not re-run.
  }, []);

  async function onSubmit() {
    setFormError(null);
    if (!tokenRef.current) {
      setFormError(strings.resetPassword.invalidLink);
      return;
    }
    const pw = validateNewPassword(newPassword);
    setPasswordError(pw ? fieldErrorMessage(pw) : null);
    if (pw) return;

    setSubmitting(true);
    const res = await resetPassword(tokenRef.current, newPassword);
    setSubmitting(false);

    if (res.ok) {
      tokenRef.current = null; // consumed — drop it
      setDone(true);
      return;
    }
    // A 400 here (validation kind) means the token is bad/expired — we already
    // validated the password client-side, so surface the invalid-link copy.
    setFormError(
      res.error.kind === "validation"
        ? strings.resetPassword.invalidLink
        : apiErrorMessage(res.error),
    );
  }

  return (
    <AuthScreen
      title={strings.resetPassword.title}
      subtitle={hasToken ? strings.resetPassword.subtitle : undefined}
    >
      {done ? (
        <Text style={styles.success} accessibilityRole="alert">
          {strings.resetPassword.success}
        </Text>
      ) : !hasToken ? (
        <Text style={styles.invalid} accessibilityRole="alert">
          {strings.resetPassword.invalidLink}
        </Text>
      ) : (
        <>
          <FormError message={formError} />
          <PasswordField
            label={strings.resetPassword.newPassword}
            value={newPassword}
            onChangeText={setNewPassword}
            textContentType="newPassword"
            error={passwordError}
          />
          <PrimaryButton
            label={strings.resetPassword.submit}
            onPress={onSubmit}
            loading={submitting}
          />
        </>
      )}

      <TextLink
        label={strings.resetPassword.backToLogin}
        onPress={() => navigation.navigate("Login")}
      />
    </AuthScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    success: {
      color: colors.success,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: spacing.lg,
    },
    invalid: {
      color: colors.danger,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: spacing.lg,
    },
  });
}
