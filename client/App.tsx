import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  StatusBar,
  StyleSheet,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  QuickExitProvider,
  useQuickExit,
} from "@/contexts/QuickExitContext";
import { QuickExitOverlay } from "@/components/QuickExitOverlay";
import { usePushNotifications } from "@/notifications/usePushNotifications";
import { colors, spacing } from "@/constants/theme";

// Shell only. Navigators, screens, and deep-linking config are added in
// Sprint 1; this establishes the provider stack, the root-mounted quick-exit
// overlay, and push-notification registration tied to auth state.
function AppContent() {
  const { isAuthenticated } = useAuth();
  const { triggerQuickExit } = useQuickExit();

  // Registers/refreshes the push token once the user is authenticated.
  usePushNotifications(isAuthenticated);

  return (
    <NavigationContainer>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.center}>
          <Text style={styles.title}>Blis-Q</Text>
          <Text style={styles.subtitle}>
            {isAuthenticated ? "Witaj ponownie" : "Bezpieczna przestrzeń"}
          </Text>
        </View>

        {/* Quick-exit trigger — mounted on the root so it is present on every
            screen without each screen knowing about it (TRANSFER §5.4). */}
        <Pressable
          accessibilityLabel="Szybkie wyjście"
          onPress={triggerQuickExit}
          hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
          style={styles.quickExitButton}
        >
          <Text style={styles.quickExitIcon}>✕</Text>
        </Pressable>
      </SafeAreaView>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QuickExitProvider>
          <View style={styles.appRoot}>
            <AppContent />
            <QuickExitOverlay />
          </View>
        </QuickExitProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.primary,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    color: colors.textMuted,
  },
  quickExitButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  quickExitIcon: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
});
