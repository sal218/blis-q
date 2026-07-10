import { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  ProfileStackParamList,
  AppTabsParamList,
} from "@/navigation/AppTabs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { signOutGoogle } from "@/lib/googleAuth";
import { deregisterPushToken } from "@/notifications/usePushNotifications";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsRow } from "@/components/SettingsRow";
import { ProfileStats } from "@/components/ProfileStats";
import {
  Faders,
  Prohibit,
  Info,
  Question,
  SignOut,
} from "@/components/icons/PhosphorIcons";
import { CrisisHeaderButton } from "@/components/CrisisHeaderButton";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_CONFIGURED } from "@/constants/support";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

type Props = CompositeScreenProps<
  NativeStackScreenProps<ProfileStackParamList, "ProfileHome">,
  BottomTabScreenProps<AppTabsParamList>
>;

// The profile stats row (Communities / Events) is intentionally hidden until the
// real counts are wired — we never show fabricated numbers. Flip to true once a
// counts source exists (Communities + Events only; Blis-Q has no friend graph so
// there is no "Connections").
const SHOW_STATS = false;

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

  const openSupportEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  };

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>{strings.profile.title}</Text>
        <CrisisHeaderButton
          onPress={() => navigation.navigate("Resources", { screen: "Crisis" })}
        />
      </View>

      {/* Profile header — display-only for now. TODO: profile photos are a
          privacy decision (deferred); the plan is curated selectable avatars in
          onboarding, not uploads. Until then this shows the initial placeholder.
          Edit-profile is a future slice (P-33), so the header isn't tappable. */}
      <View style={styles.identity}>
        <Avatar
          uri={null}
          name={user?.displayName ?? "?"}
          size={64}
          borderRadius={radius.full}
        />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.displayName ?? ""}
          </Text>
          {!!user?.email && (
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          )}
        </View>
      </View>

      {SHOW_STATS ? (
        <View style={styles.statsCard}>
          <ProfileStats stats={[]} />
        </View>
      ) : null}

      <Text style={styles.section}>{strings.profile.account}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon={<Faders size={22} color={colors.primary} />}
          label={strings.profile.theme}
          right={<ThemeToggle />}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon={<Prohibit size={22} color={colors.primary} />}
          label={strings.profile.blockedUsers}
          onPress={() => navigation.navigate("BlockedUsers")}
        />
      </View>

      <Text style={styles.section}>{strings.profile.support}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon={<Info size={22} color={colors.primary} />}
          label={strings.profile.about}
          onPress={() => navigation.navigate("About")}
        />
        {/* Help & Support only appears once a real support address is configured
            (EXPO_PUBLIC_SUPPORT_EMAIL) — no placeholder/dead mailto. */}
        {SUPPORT_EMAIL_CONFIGURED ? (
          <>
            <View style={styles.divider} />
            <SettingsRow
              icon={<Question size={22} color={colors.primary} />}
              label={strings.profile.help}
              onPress={openSupportEmail}
            />
          </>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.profile.logOut}
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.logout,
          pressed && styles.logoutPressed,
        ]}
      >
        <SignOut size={20} color={colors.primary} />
        <Text style={styles.logoutLabel}>{strings.profile.logOut}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    identity: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    identityText: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    email: {
      color: colors.textMuted,
      fontSize: 15,
      marginTop: 2,
    },
    statsCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
      ...shadow,
      shadowOpacity: 0.05,
    },
    section: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: spacing.lg,
      ...shadow,
      shadowOpacity: 0.05,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: spacing.md + 24 + spacing.md, // align under the label, past the icon
    },
    logout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
      ...shadow,
      shadowOpacity: 0.05,
    },
    logoutPressed: {
      opacity: 0.7,
    },
    logoutLabel: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
