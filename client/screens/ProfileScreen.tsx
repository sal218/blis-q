import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfileStackParamList } from "@/navigation/AppTabs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { signOutGoogle } from "@/lib/googleAuth";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

type Props = NativeStackScreenProps<ProfileStackParamList, "ProfileHome">;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, signOut } = useAuth();

  // Logout: deactivate the push token while the access token is still attached,
  // BEFORE clearing the session (P1 — a signed-out/shared device must stop
  // receiving the account's notifications), then local Google + app sign-out.
  async function onSignOut() {
    await deregisterPushToken();
    await signOutGoogle();
    await signOut();
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Text style={styles.title}>{strings.profile.title}</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{user?.displayName ?? ""}</Text>
        {!!user?.email && <Text style={styles.muted}>{user.email}</Text>}
      </View>

      <Text style={styles.section}>{strings.profile.appearance}</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{strings.profile.theme}</Text>
        <ThemeToggle />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.profile.blockedUsers}
        style={styles.row}
        onPress={() => navigation.navigate("BlockedUsers")}
      >
        <Text style={styles.rowLabel}>{strings.profile.blockedUsers}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <View style={styles.signOut}>
        <PrimaryButton
          label={strings.common.signOut}
          variant="secondary"
          onPress={onSignOut}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    name: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
    muted: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    section: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    rowLabel: {
      color: colors.text,
      fontSize: 16,
    },
    chevron: {
      color: colors.textMuted,
      fontSize: 22,
    },
    signOut: {
      marginTop: spacing.xl,
    },
  });
}
