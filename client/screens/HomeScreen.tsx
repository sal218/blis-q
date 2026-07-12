import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppTabsParamList } from "@/navigation/AppTabs";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { useHomeEvents } from "@/hooks/useHomeEvents";
import { useHomeNews } from "@/hooks/useHomeNews";
import { SectionHeader } from "@/components/SectionHeader";
import {
  CommunityRailCard,
  RAIL_CARD_WIDTH,
  RAIL_CARD_HEIGHT,
  RAIL_CARD_RADIUS,
} from "@/components/CommunityRailCard";
import { EventCard } from "@/components/EventCard";
import { NewsCard } from "@/components/NewsCard";
import { CrisisHeaderButton } from "@/components/CrisisHeaderButton";
import { RailSkeleton } from "@/components/skeleton/RailSkeleton";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { strings, format } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// Home tab (design ref: assets/home-screen.png). Greeting + a live
// "Your communities" rail + a live "Upcoming events" rail (the caller's own
// RSVP'd "going" events). Safe-places + activity remain polished empty states
// until their data exists (safe places Sprint 7; cross-community activity feed —
// P-13). Communities + events live under the Events tab, so taps deep-link into
// the Events stack. Light = mockup, dark = brand purple.

type Props = BottomTabScreenProps<AppTabsParamList, "Home">;
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { communities, status } = useHomeCommunities();
  const { events, status: eventsStatus } = useHomeEvents();
  const { news, status: newsStatus } = useHomeNews();

  const name = user?.displayName?.trim();
  const greeting = name
    ? format(strings.home.greeting, { name })
    : strings.home.greetingNoName;

  // `initial: false` puts the Events-stack root (EventsHome) BENEATH the pushed
  // screen, so Back from a Home-opened event/community lands on the events list
  // (not straight back to Home) and the Events tab is never left holding a lone
  // detail screen with no list under it.
  const openCommunity = (id: string) =>
    navigation.navigate("Events", {
      screen: "CommunityDetail",
      params: { id },
      initial: false,
    });
  const goToCommunities = () =>
    navigation.navigate("Events", { screen: "EventsHome" });
  const openEvent = (id: string) =>
    navigation.navigate("Events", {
      screen: "EventDetail",
      params: { id },
      initial: false,
    });
  const goToEvents = () =>
    navigation.navigate("Events", { screen: "EventsHome" });
  const goToNews = () =>
    navigation.navigate("Resources", { screen: "NewsFeed", initial: false });
  const openArticle = (id: string) =>
    navigation.navigate("Resources", {
      screen: "NewsArticle",
      params: { id },
      initial: false,
    });
  const openCrisis = () =>
    // `initial: false` keeps the Resources-stack root (ResourcesHome / Wsparcie)
    // BENEATH Crisis, so Back from the safety page lands on the Wsparcie list —
    // not back on this tab (which would strand the Resources stack on Crisis).
    navigation.navigate("Resources", { screen: "Crisis", initial: false });

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subtitle}>{strings.home.subtitle}</Text>
        </View>
        <CrisisHeaderButton onPress={openCrisis} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={strings.home.yourCommunities}
          onSeeAll={goToCommunities}
        />
        {status === "loading" ? (
          <RailSkeleton />
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
              <View style={styles.addButton}>
                <Ionicons name="add" size={28} color="#FFFFFF" />
              </View>
            </Pressable>
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={strings.home.upcomingEvents}
          onSeeAll={goToEvents}
        />
        {eventsStatus === "loading" ? (
          <CardListSkeleton variant="event" count={2} padded={false} />
        ) : events.length === 0 ? (
          <View style={styles.placeholderCard}>
            <Ionicons
              name="calendar-outline"
              size={28}
              color={colors.textMuted}
            />
            <Text style={styles.placeholderText}>
              {strings.home.noUpcomingEvents}
            </Text>
          </View>
        ) : (
          <View style={styles.eventsList}>
            {events.slice(0, 3).map((e) => (
              <EventCard key={e.id} event={e} onPress={openEvent} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={strings.home.news} onSeeAll={goToNews} />
        {newsStatus === "loading" ? (
          <CardListSkeleton count={2} padded={false} />
        ) : news.length === 0 ? (
          <View style={styles.placeholderCard}>
            <Ionicons
              name="newspaper-outline"
              size={28}
              color={colors.textMuted}
            />
            <Text style={styles.placeholderText}>{strings.home.noNews}</Text>
          </View>
        ) : (
          <View style={styles.eventsList}>
            {news.slice(0, 3).map((a) => (
              <NewsCard
                key={a.id}
                article={a}
                onPress={(x) => openArticle(x.id)}
              />
            ))}
          </View>
        )}
      </View>

      <PlaceholderSection
        title={strings.home.nearbyPlaces}
        icon="location-outline"
        message={strings.home.placesEmpty}
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
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    headerText: {
      flex: 1,
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
    eventsList: {
      gap: spacing.sm,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      alignSelf: "center",
      marginRight: spacing.md,
    },
    addCard: {
      width: RAIL_CARD_WIDTH,
      height: RAIL_CARD_HEIGHT,
      borderRadius: RAIL_CARD_RADIUS,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    addButton: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
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
