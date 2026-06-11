import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { signOutGoogle } from "@/lib/googleAuth";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { strings } from "@/i18n";
import { colors, spacing } from "@/constants/theme";

// Minimal authenticated landing. The real app shell (tabs, communities, etc.)
// lands in later branches — this exists so the auth journey is demonstrably
// end-to-end (sign in → here → sign out) and so RootNavigator has an
// authenticated destination.

export function HomePlaceholder() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  async function onSignOut() {
    // Deactivate this device's push token while the access token is still
    // available — BEFORE clearing the session — so the signed-out device stops
    // receiving the account's notifications (P1, privacy-sensitive in Blis-Q).
    await deregisterPushToken();
    await signOutGoogle();
    await signOut();
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.center}>
        <Text style={styles.brand}>{strings.common.appName}</Text>
        <Text style={styles.greeting}>
          {strings.login.subtitle}
          {user?.displayName ? `, ${user.displayName}` : ""}
        </Text>
      </View>
      <PrimaryButton
        label={strings.common.signOut}
        variant="secondary"
        onPress={onSignOut}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: colors.primary,
    fontSize: 36,
    fontWeight: "900",
  },
  greeting: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: spacing.sm,
  },
});
