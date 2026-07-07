import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { useTheme } from "@/contexts/ThemeContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { strings, format } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/AppTabs";

// A simple static "About Blis-Q" screen reached from Profile → Wsparcie. No user
// data, no network — app name, a short mission blurb, and the build version.
// Full-bleed: its own ScreenHeader, no native top bar.

type Props = NativeStackScreenProps<ProfileStackParamList, "About">;

export function AboutScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const version = Constants.expoConfig?.version ?? "";

  return (
    <View style={styles.root}>
      <ScreenHeader title={strings.about.title} onBack={navigation.goBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text style={styles.appName}>{strings.common.appName}</Text>
        {version ? (
          <Text style={styles.version}>
            {format(strings.about.version, { version })}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.body}>{strings.about.body}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
    },
    scroll: {
      flex: 1,
    },
    appName: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    version: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      ...shadow,
      shadowOpacity: 0.05,
    },
    body: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
