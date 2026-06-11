import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AuthScreenProps } from "@/navigation/types";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { GoogleButton } from "@/components/forms/GoogleButton";
import { GoogleConsentModal } from "@/components/GoogleConsentModal";
import { strings } from "@/i18n";
import { colors, spacing } from "@/constants/theme";

// Entry screen: brand + the three ways in (create account, sign in, Google).
// Google sign-in is driven by useGoogleSignIn; first-time Google users get the
// consent sheet before an account is created.

export function WelcomeScreen({ navigation }: AuthScreenProps<"Welcome">) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const google = useGoogleSignIn({ onSignedIn: signIn });

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>{strings.common.appName}</Text>
        <Text style={styles.tagline}>{strings.welcome.tagline}</Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={strings.welcome.createAccount}
          onPress={() => navigation.navigate("SignUp")}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label={strings.welcome.signIn}
          variant="secondary"
          onPress={() => navigation.navigate("Login")}
        />
        <View style={styles.divider} />
        <GoogleButton onPress={google.start} loading={google.loading} />
      </View>

      <GoogleConsentModal
        visible={google.needsConsent}
        loading={google.loading}
        error={google.error}
        onSubmit={google.submitConsent}
        onCancel={google.cancelConsent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: colors.primary,
    fontSize: 44,
    fontWeight: "900",
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  actions: {
    paddingBottom: spacing.xl,
  },
  gap: {
    height: spacing.md,
  },
  divider: {
    height: spacing.lg,
  },
});
