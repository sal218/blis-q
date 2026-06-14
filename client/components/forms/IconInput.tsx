import { useMemo, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Single-line input with a leading icon and an optional trailing accessory,
// placeholder-only (no floating label) — the field style used on the login
// screen (design ref: assets/login-screen.png). The border lifts to the brand
// colour on focus. `accessibilityLabel` is required so the field is reachable by
// name even without a visible label.

interface IconInputProps {
  icon: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  rightAccessory?: React.ReactNode;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
}

export function IconInput({
  icon,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  secureTextEntry,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize = "none",
  rightAccessory,
  onSubmitEditing,
  returnKeyType,
}: IconInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, focused && styles.rowFocused]}>
      <View style={styles.icon}>{icon}</View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        accessibilityLabel={accessibilityLabel}
      />
      {rightAccessory}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 52,
      marginBottom: spacing.md,
    },
    rowFocused: {
      borderColor: colors.primary,
    },
    icon: {
      marginRight: spacing.sm,
    },
    input: {
      flex: 1,
      height: "100%",
      color: colors.text,
      fontSize: 16,
    },
  });
}
