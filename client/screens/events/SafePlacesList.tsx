import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { MagnifyingGlass, X, MapPin } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { SafePlaceCard } from "@/components/SafePlaceCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useSafePlaces } from "@/hooks/useSafePlaces";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { SAFE_PLACE_CATEGORIES, type SafePlaceCategory } from "@shared/types";

// The Safe places segment of the Events tab (epic P-40 slice SP-3): a city
// search + a category filter chip row + the admin-curated venue list. Filters
// are server-side; the list is offset-paginated (load-more). An OSM attribution
// footer satisfies the ODbL licence. Proximity ("near me") ordering ships with
// the map (SP-4). No coordinates are shown to the user.

type Props = {
  onOpenPlace?: (id: string) => void;
  onOpenMap?: () => void; // opens the full-screen map (P-40 SP-4b)
};

export function SafePlacesList({ onOpenPlace, onOpenMap }: Props = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    category,
    search,
    setCategory,
    setSearch,
    toggleSave,
    refresh,
    loadMore,
    retry,
  } = useSafePlaces();
  const [query, setQuery] = useState("");

  // Live type-ahead: debounce the text box so the list filters as the user
  // types (no need to submit). setSearch no-ops when the trimmed term is
  // unchanged, so deleting back to empty falls straight through to the full
  // list. A stray keystroke is coalesced by the trailing timer.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(id);
  }, [query, setSearch]);

  const clearSearch = () => {
    setQuery("");
    setSearch(""); // reset to the full list immediately, don't wait for debounce
  };

  // Empty-copy precedence: an active SEARCH that matches nothing → search
  // message; else an active CATEGORY → category message; else the plain empty.
  const emptyText = search
    ? strings.safePlaces.emptySearch
    : category
      ? strings.safePlaces.emptyCategory
      : strings.safePlaces.empty;

  if (status === "loading" && items.length === 0) {
    return <CardListSkeleton showSearch count={6} />;
  }

  if (status === "error" && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMessage ?? strings.safePlaces.loadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.safePlaces.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  // Local filter pill — a premium solid-purple-active / neutral-inactive style
  // built here on purpose, rather than restyling the shared <CategoryChip> (used
  // across 7 event + safe-place surfaces) and regressing those.
  const renderPill = (
    label: string,
    active: boolean,
    onPress: () => void,
    key: string,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <MagnifyingGlass size={20} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.safePlaces.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => setSearch(query)}
        />
        {query.length > 0 && (
          <Pressable
            onPress={clearSearch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={strings.safePlaces.clear}
            style={styles.clearBtn}
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {renderPill(
          strings.safePlaces.filterAll,
          category === null,
          () => setCategory(null),
          "all",
        )}
        {SAFE_PLACE_CATEGORIES.map((c: SafePlaceCategory) =>
          renderPill(
            strings.safePlaces.categories[c],
            category === c,
            () => setCategory(c),
            c,
          ),
        )}
      </ScrollView>

      <FlatList
        testID="safe-places-list"
        style={styles.list}
        showsVerticalScrollIndicator={false}
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          // Map entry (P-40 SP-4b) — opens the full-screen Safe Places map. A
          // dedicated screen (not an interactive map embedded here) avoids
          // FlatList pan/scroll gesture conflicts; a compact live preview is
          // slice 2. It scrolls with the cards, matching the reference.
          <Pressable
            testID="safe-places-map-entry"
            accessibilityRole="button"
            accessibilityLabel={strings.safePlaces.map.open}
            onPress={onOpenMap}
            style={({ pressed }) => [
              styles.mapPlaceholder,
              pressed && styles.mapEntryPressed,
            ]}
          >
            <View style={styles.mapExpand}>
              <Text style={styles.mapExpandText}>
                {strings.safePlaces.map.open}
              </Text>
            </View>
            <MapPin size={34} color={colors.primary} />
            <Text style={styles.mapHint}>
              {strings.safePlaces.map.openHint}
            </Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <SafePlaceCard
            place={item}
            onToggleSave={toggleSave}
            onPress={onOpenPlace ? (p) => onOpenPlace(p.id) : undefined}
          />
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
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
        ListFooterComponent={
          <View style={styles.footer}>
            {loadingMore ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              // Bottom info: the curation framing (relocated here from above the
              // list) as an info panel + the ODbL OSM attribution.
              <View style={styles.infoPanel}>
                <Text style={styles.disclaimer}>
                  {strings.safePlaces.disclaimer}
                </Text>
                <Text style={styles.attribution}>
                  {strings.safePlaces.attribution}
                </Text>
              </View>
            )}
          </View>
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: { alignSelf: "stretch" },
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
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      ...shadow,
      shadowOpacity: 0.05,
    },
    search: {
      flex: 1,
      paddingVertical: spacing.md,
      marginLeft: spacing.sm,
      color: colors.text,
      fontSize: 16,
    },
    clearBtn: {
      padding: spacing.xs,
      marginLeft: spacing.xs,
    },
    filterScroll: { flexGrow: 0 },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    // Local premium filter pill (see renderPill).
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillInactive: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    pillText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "600",
    },
    pillTextActive: {
      color: "#FFFFFF",
    },
    // Map placeholder panel (interactive map lands with SP-4 / P-40).
    mapPlaceholder: {
      height: 180,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    mapEntryPressed: { opacity: 0.7 },
    mapExpand: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    mapExpandText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "600",
    },
    mapHint: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "600",
    },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    separator: { height: spacing.md },
    footer: { paddingVertical: spacing.lg },
    infoPanel: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    disclaimer: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    attribution: {
      color: colors.textMuted,
      fontSize: 12,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
