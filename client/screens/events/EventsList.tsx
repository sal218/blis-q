import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { MagnifyingGlass } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CategoryChip } from "@/components/CategoryChip";
import { EventCard } from "@/components/EventCard";
import { useEvents } from "@/hooks/useEvents";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import { EVENT_CATEGORIES } from "@shared/types";

// The Events segment of the Events tab (design ref: events-screen.png): a search
// box, a server-side CATEGORY filter chip row (slice D2), and the global
// upcoming-events feed. Search filters the LOADED events client-side
// (title/location); the category filter is server-side (?category=). Server-side
// full-text search is still deferred (P-28). The card shows the going count only
// — no attendee identities. Tap a card → the detail screen (RSVP lives there).

type Props = { onOpenEvent: (id: string) => void };

export function EventsList({ onOpenEvent }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    events,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    category,
    setCategory,
    refresh,
    loadMore,
    retry,
  } = useEvents();
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(trimmed) ||
          (e.location ?? "").toLowerCase().includes(trimmed),
      )
    : events;

  // Empty-state copy precedence: an active SEARCH that narrows to nothing always
  // shows the search message (even inside a category); otherwise an active
  // CATEGORY filter shows the category message; otherwise the plain empty feed.
  const emptyText = trimmed
    ? strings.events.emptySearch
    : category
      ? strings.events.emptyCategory
      : strings.events.empty;

  if (status === "loading" && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" && events.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMessage ?? strings.events.loadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.events.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <MagnifyingGlass size={18} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.events.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Server-side category filter: "All" clears; each chip refetches the feed
          via ?category=. Horizontal scroll so all 8 + All fit on small screens. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <CategoryChip
          label={strings.events.filterAll}
          selected={category === null}
          onPress={() => setCategory(null)}
        />
        {EVENT_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={strings.events.categories[c]}
            selected={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </ScrollView>

      <FlatList
        testID="events-list"
        showsVerticalScrollIndicator={false}
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={onOpenEvent} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    search: {
      flex: 1,
      paddingVertical: spacing.sm,
      marginLeft: spacing.sm,
      color: colors.text,
      fontSize: 16,
    },
    filterRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    separator: {
      height: spacing.sm,
    },
    footer: {
      paddingVertical: spacing.md,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
