import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { CaretLeft } from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Shared header for full-bleed pushed screens (no native stack bar). A fixed top
// row: safe-area top padding, a bordered circular back button (mirrors the
// ResourceDetail / SafePlaceDetail floating back button), and an optional
// left-aligned title. The screen renders this above its content; scroll/list
// content flows underneath. Pass `onBack={navigation.goBack}`.

type Props = {
  title?: string;
  onBack: () => void;
};

export function ScreenHeader({ title, onBack }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.common.back}
        hitSlop={8}
        onPress={onBack}
        style={styles.backBtn}
      >
        <CaretLeft size={22} color={colors.text} />
      </Pressable>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
  });
}
