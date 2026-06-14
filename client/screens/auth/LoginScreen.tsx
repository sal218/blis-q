import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { AuthScreenProps } from "@/navigation/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { BrandMark } from "@/components/BrandMark";
import { IconInput } from "@/components/forms/IconInput";
import { SocialButton } from "@/components/forms/SocialButton";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { GoogleConsentModal } from "@/components/GoogleConsentModal";
import { login } from "@/lib/api/auth";
import { validateEmail, isNonEmpty } from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Login-first entry screen (design ref: assets/login-screen.png): brand, email +
// password, social sign-in, and a link to sign up. Quick-exit is intentionally
// not mounted here (paused — see App.tsx). Apple sign-in is a visual placeholder
// for now (tracker P-12); Google uses the real flow via useGoogleSignIn.

export function LoginScreen({ navigation }: AuthScreenProps<"Login">) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signIn } = useAuth();
  const google = useGoogleSignIn({ onSignedIn: signIn });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setFormError(null);
    // This design has no inline field-error slots — surface validation through
    // the single form-error banner. Login never hints the password policy, so an
    // empty password reads as generic invalid credentials.
    const em = validateEmail(email);
    if (em) {
      setFormError(fieldErrorMessage(em));
      return;
    }
    if (!isNonEmpty(password)) {
      setFormError(strings.errors.invalidCredentials);
      return;
    }

    setSubmitting(true);
    const res = await login(email.trim().toLowerCase(), password);
    setSubmitting(false);

    if (res.ok) {
      await signIn(res.data);
    } else {
      setFormError(apiErrorMessage(res.error));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <BrandMark size={68} />
          <Text style={styles.brand}>{strings.common.appName}</Text>
          <Text style={styles.tagline}>{strings.login.taglinePrimary}</Text>
          <Text style={styles.taglineAccent}>
            {strings.login.taglineAccent}
          </Text>
        </View>

        <FormError message={formError} />

        <IconInput
          icon={
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.textMuted}
            />
          }
          value={email}
          onChangeText={setEmail}
          placeholder={strings.login.emailPlaceholder}
          accessibilityLabel={strings.common.email}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <IconInput
          icon={
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={colors.textMuted}
            />
          }
          value={password}
          onChangeText={setPassword}
          placeholder={strings.login.passwordPlaceholder}
          accessibilityLabel={strings.common.password}
          secureTextEntry={!showPassword}
          autoComplete="off"
          textContentType="password"
          onSubmitEditing={onSubmit}
          returnKeyType="go"
          rightAccessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? strings.common.hide : strings.common.show
              }
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          }
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.login.forgotPassword}
          onPress={() => navigation.navigate("ForgotPassword")}
          hitSlop={8}
          style={styles.forgotWrap}
        >
          <Text style={styles.forgotText}>{strings.login.forgotPassword}</Text>
        </Pressable>

        <PrimaryButton
          label={strings.login.submit}
          onPress={onSubmit}
          loading={submitting}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{strings.login.orContinue}</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          {/* Apple sign-in is not implemented yet — visual placeholder per the
              mockup (tracker P-12). App Store rules will require it once Google
              ships, so the button stays. */}
          <SocialButton
            provider="apple"
            label={strings.login.continueWithApple}
            onPress={() => {}}
          />
          <View style={styles.socialGap} />
          <SocialButton
            provider="google"
            label={strings.login.continueWithGoogle}
            onPress={google.start}
            loading={google.loading}
          />
        </View>

        <View style={styles.signupRow}>
          <Text style={styles.signupPrompt}>
            {strings.login.noAccountPrompt}{" "}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.login.signUpLink}
            onPress={() => navigation.navigate("SignUp")}
            hitSlop={8}
          >
            <Text style={styles.signupLink}>{strings.login.signUpLink}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <GoogleConsentModal
        visible={google.needsConsent}
        loading={google.loading}
        error={google.error}
        onSubmit={google.submitConsent}
        onCancel={google.cancelConsent}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    header: {
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    brand: {
      color: colors.text,
      fontSize: 32,
      fontWeight: "900",
      marginTop: spacing.md,
    },
    tagline: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginTop: spacing.sm,
    },
    taglineAccent: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
      marginTop: spacing.xs,
    },
    forgotWrap: {
      alignSelf: "flex-end",
      marginBottom: spacing.lg,
    },
    forgotText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
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
    socialGap: {
      width: spacing.md,
    },
    signupRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.xl,
    },
    signupPrompt: {
      color: colors.textMuted,
      fontSize: 14,
    },
    signupLink: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "700",
    },
  });
}
