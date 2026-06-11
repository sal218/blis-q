import { NavigationContainer } from "@react-navigation/native";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/notifications/usePushNotifications";
import { AuthStack } from "@/navigation/AuthStack";
import { HomePlaceholder } from "@/screens/HomePlaceholder";
import { linking } from "@/navigation/linking";
import { colors } from "@/constants/theme";

// Root of the app's navigation. Bootstraps from the persisted session
// (AuthContext) and swaps between the unauthenticated auth stack and the
// authenticated app based on `isAuthenticated`. While the session is being
// restored from SecureStore it shows a neutral splash.

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Register/refresh the push token once authenticated.
  usePushNotifications(isAuthenticated);

  return (
    <NavigationContainer linking={linking} fallback={<Splash />}>
      {isLoading ? (
        <Splash />
      ) : isAuthenticated ? (
        <HomePlaceholder />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
