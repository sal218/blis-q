import { useMemo } from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Compact "Continue with …" social button (design ref: login-screen.png), used
// side by side. Apple = solid dark with the Apple glyph; Google = white card
// with the Google glyph. Both have fixed brand colours (independent of light/
// dark theme) so they stay recognisable.

interface SocialButtonProps {
  provider: "apple" | "google";
  label: string;
  onPress: () => void;
  loading?: boolean;
}

export function SocialButton({
  provider,
  label,
  onPress,
  loading = false,
}: SocialButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isApple = provider === "apple";
  const fg = isApple ? "#FFFFFF" : "#1F1F1F";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isApple ? styles.apple : styles.google,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <Ionicons
            name={isApple ? "logo-apple" : "logo-google"}
            size={18}
            color={isApple ? "#FFFFFF" : "#4285F4"}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 50,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
    },
    apple: {
      backgroundColor: "#000000",
    },
    google: {
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: {
      opacity: 0.85,
    },
    icon: {
      marginRight: spacing.sm,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
