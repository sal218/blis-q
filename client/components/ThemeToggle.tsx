import { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { radius, type ThemeColors } from "@/constants/theme";

// Sun/moon light–dark switch. A two-segment pill: tap the sun for light, the
// moon for dark; the active mode is highlighted. Theme choice persists via
// ThemeContext (SecureStore), so it sticks across the app and restarts.

export function ThemeToggle() {
  const { mode, setMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.pill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.profile.themeLight}
        accessibilityState={{ selected: mode === "light" }}
        onPress={() => setMode("light")}
        style={[styles.segment, mode === "light" && styles.segmentActive]}
      >
        <Ionicons
          name="sunny"
          size={18}
          color={mode === "light" ? "#FFFFFF" : colors.textMuted}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.profile.themeDark}
        accessibilityState={{ selected: mode === "dark" }}
        onPress={() => setMode("dark")}
        style={[styles.segment, mode === "dark" && styles.segmentActive]}
      >
        <Ionicons
          name="moon"
          size={16}
          color={mode === "dark" ? "#FFFFFF" : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      padding: 3,
    },
    segment: {
      width: 36,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
  });
}
