import { View, StatusBar, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { ScreenBackground } from "@/components/ScreenBackground";
import { RootNavigator } from "@/navigation/RootNavigator";

// Quick-exit (the discreet top-right trigger + neutral cover) is intentionally
// NOT mounted right now — it's paused pending a product/safety review (it may do
// more harm than good UX-wise). The QuickExit context/components still exist and
// can be re-mounted here when that decision lands. Do not re-add without sign-off.

// Lives INSIDE ThemeProvider so the app background + status bar follow the active
// theme (App() itself is above the provider and can't read it). ScreenBackground
// is the single app-wide background (gradient in dark, white in light); the nav
// theme, navigators and screen roots are all transparent so it shows through
// everywhere — see ScreenBackground / RootNavigator.
function ThemedRoot() {
  const { colors, mode } = useTheme();
  return (
    <View style={[styles.appRoot, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <ScreenBackground />
      <RootNavigator />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedRoot />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
});
