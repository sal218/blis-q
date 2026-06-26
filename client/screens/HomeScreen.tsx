import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppTabsParamList } from "@/navigation/AppTabs";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { SectionHeader } from "@/components/SectionHeader";
import { CommunityRailCard } from "@/components/CommunityRailCard";
import { Avatar } from "@/components/Avatar";
import { strings, format } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// Home tab (design ref: assets/home-screen.png). Greeting + avatar + a live
// "Your communities" rail; events / safe-places / activity are polished empty
// states until their data exists (events Sprint 6, safe places Sprint 7;
// cross-community activity feed — P-13). Communities live under the Events tab,
// so taps deep-link into the Events stack. Light = mockup, dark = brand purple.

type Props = BottomTabScreenProps<AppTabsParamList, "Home">;
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { communities, status } = useHomeCommunities();

  const name = user?.displayName?.trim();
  const greeting = name
    ? format(strings.home.greeting, { name })
    : strings.home.greetingNoName;

  const openCommunity = (id: string) =>
    navigation.navigate("Events", {
      screen: "CommunityDetail",
      params: { id },
    });
  const goToCommunities = () =>
    navigation.navigate("Events", { screen: "EventsHome" });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subtitle}>{strings.home.subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.home.profileA11y}
          onPress={() => navigation.navigate("ProfileTab")}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Avatar
            uri={user?.avatarUrl ?? null}
            name={name ?? "?"}
            size={44}
            borderRadius={radius.full}
          />
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={strings.home.yourCommunities}
          onSeeAll={goToCommunities}
        />
        {status === "loading" ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.railLoading}
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {communities.map((c) => (
              <CommunityRailCard
                key={c.id}
                community={c}
                onPress={openCommunity}
              />
            ))}
            {status === "ready" && communities.length === 0 ? (
              <Text style={styles.emptyText}>{strings.home.noCommunities}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.home.yourCommunities}
              onPress={goToCommunities}
              style={({ pressed }) => [
                styles.addCard,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={40} color={colors.primary} />
            </Pressable>
          </ScrollView>
        )}
      </View>

      <PlaceholderSection
        title={strings.home.upcomingEvents}
        icon="calendar-outline"
        message={strings.home.eventsEmpty}
        styles={styles}
        colors={colors}
      />
      <PlaceholderSection
        title={strings.home.nearbyPlaces}
        icon="location-outline"
        message={strings.home.placesEmpty}
        styles={styles}
        colors={colors}
      />
      <PlaceholderSection
        title={strings.home.latestActivity}
        icon="newspaper-outline"
        message={strings.home.activityEmpty}
        styles={styles}
        colors={colors}
      />
    </ScrollView>
  );
}

// A section whose data doesn't exist yet → header + a soft-shadow card with a
// muted icon and message (matches the mockup's card aesthetic).
function PlaceholderSection({
  title,
  icon,
  message,
  styles,
  colors,
}: {
  title: string;
  icon: IoniconName;
  message: string;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.placeholderCard}>
        <Ionicons name={icon} size={28} color={colors.textMuted} />
        <Text style={styles.placeholderText}>{message}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    headerText: {
      flex: 1,
      marginRight: spacing.md,
    },
    greeting: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      marginTop: spacing.xs,
    },
    section: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.xl,
    },
    rail: {
      paddingRight: spacing.lg,
      paddingVertical: spacing.xs,
    },
    railLoading: {
      alignSelf: "flex-start",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      alignSelf: "center",
      marginRight: spacing.md,
    },
    addCard: {
      width: 150,
      height: 150,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    pressed: {
      opacity: 0.85,
    },
    placeholderCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      alignItems: "center",
      gap: spacing.sm,
      ...shadow,
    },
    placeholderText: {
      color: colors.textMuted,
      fontSize: 14,
    },
  });
}
