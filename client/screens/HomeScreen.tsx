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
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppTabsParamList } from "@/navigation/AppTabs";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { SectionHeader } from "@/components/SectionHeader";
import { CommunityRailCard } from "@/components/CommunityRailCard";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";

// Home tab (design ref: assets/home-screen.png). Greeting + a live "Your
// communities" rail; events / safe-places / activity are placeholder sections
// until their data exists (events Sprint 6, safe places Sprint 7; cross-community
// activity feed — P-13). Communities live under the Events tab, so taps deep-link
// into the Events stack. Light = mockup, dark = brand purple.

type Props = BottomTabScreenProps<AppTabsParamList, "Home">;

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
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.subtitle}>{strings.home.subtitle}</Text>
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
              <Text style={styles.addGlyph}>＋</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>

      <PlaceholderSection title={strings.home.upcomingEvents} styles={styles} />
      <PlaceholderSection title={strings.home.nearbyPlaces} styles={styles} />
      <PlaceholderSection title={strings.home.latestActivity} styles={styles} />
    </ScrollView>
  );
}

// A section whose data doesn't exist yet → header + a muted "Wkrótce" card.
function PlaceholderSection({
  title,
  styles,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderText}>{strings.home.comingSoon}</Text>
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
    header: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
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
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    pressed: {
      opacity: 0.85,
    },
    addGlyph: {
      color: colors.primary,
      fontSize: 40,
      fontWeight: "300",
    },
    placeholderCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      alignItems: "center",
    },
    placeholderText: {
      color: colors.textMuted,
      fontSize: 14,
    },
  });
}
