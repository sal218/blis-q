import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Labelled text input with an inline error slot. `error` is already-localized
// copy (resolve codes via @/lib/messages before passing). The border turns red
// while an error is shown so the field is obvious without relying on colour
// alone (the message carries the meaning).

type Props = {
  label: string;
  // Hide the visible label (the input keeps it as its accessibilityLabel). Used
  // when a parent already shows the field title, e.g. a SectionCard header.
  hideLabel?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  secureTextEntry?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
  rightAccessory?: React.ReactNode;
};

export function TextField({
  label,
  hideLabel = false,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  textContentType,
  secureTextEntry,
  editable = true,
  onSubmitEditing,
  returnKeyType,
  rightAccessory,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, hideLabel && styles.wrapNoMargin]}>
      {!hideLabel && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          !editable && styles.inputDisabled,
        ]}
      >
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          accessibilityLabel={label}
        />
        {rightAccessory}
      </View>
      {!!error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.md,
    },
    wrapNoMargin: {
      marginBottom: 0,
    },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    inputError: {
      borderColor: colors.danger,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    input: {
      flex: 1,
      height: 50,
      color: colors.text,
      fontSize: 16,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      marginTop: spacing.xs,
    },
  });
}
