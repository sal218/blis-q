import { useState } from "react";
import { Pressable, Text, StyleSheet, type TextInputProps } from "react-native";
import { TextField } from "@/components/forms/TextField";
import { strings } from "@/i18n";
import { colors, spacing } from "@/constants/theme";

// Password input with a show/hide toggle. Defaults to obscured. Built on
// TextField so the label/error styling stays consistent.

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  textContentType?: TextInputProps["textContentType"];
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
};

export function PasswordField({
  label,
  value,
  onChangeText,
  error,
  textContentType = "password",
  onSubmitEditing,
  returnKeyType,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      error={error}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoComplete="off"
      textContentType={textContentType}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      rightAccessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? strings.common.hide : strings.common.show}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>
            {visible ? strings.common.hide : strings.common.show}
          </Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    paddingLeft: spacing.sm,
  },
  toggleText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
});
