import { useMemo } from "react";
import { View, Text, Pressable, StatusBar, StyleSheet } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { QuickExitProvider, useQuickExit } from "@/contexts/QuickExitContext";
import { QuickExitOverlay } from "@/components/QuickExitOverlay";
import { RootNavigator } from "@/navigation/RootNavigator";
import { spacing, type ThemeColors } from "@/constants/theme";

// Root quick-exit trigger. Mounted ABOVE the navigator so it is present on every
// screen without each screen knowing about it (TRANSFER §5.4). The overlay it
// reveals is the QuickExitOverlay mounted alongside it.
function RootQuickExitButton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { triggerQuickExit } = useQuickExit();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityLabel="Szybkie wyjście"
      onPress={triggerQuickExit}
      hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
      style={[styles.quickExitButton, { top: insets.top + spacing.sm }]}
    >
      <Text style={styles.quickExitIcon}>✕</Text>
    </Pressable>
  );
}

// Lives INSIDE ThemeProvider so the app background + status bar follow the active
// theme (App() itself is above the provider and can't read it).
function ThemedRoot() {
  const { colors, mode } = useTheme();
  return (
    <View style={[styles.appRoot, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <RootNavigator />
      <RootQuickExitButton />
      {/* Sits above everything — instant, animation-free neutral mask. */}
      <QuickExitOverlay />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <QuickExitProvider>
            <ThemedRoot />
          </QuickExitProvider>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    quickExitButton: {
      position: "absolute",
      right: spacing.md,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      zIndex: 10,
    },
    quickExitIcon: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
  });
}
