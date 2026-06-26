import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type Theme,
} from "@react-navigation/native";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePushNotifications } from "@/notifications/usePushNotifications";
import { AuthStack } from "@/navigation/AuthStack";
import { AppTabs } from "@/navigation/AppTabs";
import { AccountSuspendedScreen } from "@/screens/AccountSuspendedScreen";
import { linking } from "@/navigation/linking";

// Root of the app's navigation. Bootstraps from the persisted session
// (AuthContext) and swaps between the unauthenticated auth stack and the
// authenticated tab shell based on `isAuthenticated`. The NavigationContainer is
// handed a theme derived from the active palette so nav chrome follows the mode.

function Splash() {
  const { colors } = useTheme();
  // Transparent so the app-wide ScreenBackground shows behind the spinner.
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isLoading, isSuspended } = useAuth();
  const { colors, mode } = useTheme();

  // Register/refresh the push token once authenticated.
  usePushNotifications(isAuthenticated);

  const navTheme: Theme = {
    ...(mode === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === "dark" ? DarkTheme : DefaultTheme).colors,
      primary: colors.primary,
      // Transparent so the app-wide ScreenBackground (rendered behind the
      // NavigationContainer) shows through every scene. Screen roots and stack
      // contentStyles are transparent too.
      background: "transparent",
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };

  return (
    <NavigationContainer
      theme={navTheme}
      linking={linking}
      fallback={<Splash />}
    >
      {isLoading ? (
        <Splash />
      ) : isSuspended ? (
        <AccountSuspendedScreen />
      ) : isAuthenticated ? (
        <AppTabs />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
