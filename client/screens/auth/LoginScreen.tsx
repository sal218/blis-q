import { useMemo } from "react";
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
import { useEmailLogin } from "@/hooks/useEmailLogin";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconInput } from "@/components/forms/IconInput";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { LoginSocialButtons } from "@/components/LoginSocialButtons";
import { GoogleConsentModal } from "@/components/GoogleConsentModal";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Login-first entry screen (design ref: assets/login-screen.png): brand, email +
// password, social sign-in, and a link to sign up. Composition only — form state
// lives in useEmailLogin, the social row in LoginSocialButtons, the Google flow
// in useGoogleSignIn. Quick-exit is intentionally not mounted (paused — App.tsx).

export function LoginScreen({ navigation }: AuthScreenProps<"Login">) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signIn } = useAuth();
  const google = useGoogleSignIn({ onSignedIn: signIn });
  const form = useEmailLogin();

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

        <FormError message={form.formError} />

        <IconInput
          icon={
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.textMuted}
            />
          }
          value={form.email}
          onChangeText={form.setEmail}
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
          value={form.password}
          onChangeText={form.setPassword}
          placeholder={strings.login.passwordPlaceholder}
          accessibilityLabel={strings.common.password}
          secureTextEntry={!form.showPassword}
          autoComplete="off"
          textContentType="password"
          onSubmitEditing={form.submit}
          returnKeyType="go"
          rightAccessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                form.showPassword ? strings.common.hide : strings.common.show
              }
              onPress={form.toggleShowPassword}
              hitSlop={8}
            >
              <Ionicons
                name={form.showPassword ? "eye-off-outline" : "eye-outline"}
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
          onPress={form.submit}
          loading={form.submitting}
        />

        <LoginSocialButtons
          onGoogle={google.start}
          googleLoading={google.loading}
        />

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

      <View style={[styles.themeToggle, { top: insets.top + spacing.sm }]}>
        <ThemeToggle />
      </View>

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
    themeToggle: {
      position: "absolute",
      right: spacing.lg,
      zIndex: 10,
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
