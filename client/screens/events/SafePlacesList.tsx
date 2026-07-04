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
import { MagnifyingGlass, X } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CategoryChip } from "@/components/CategoryChip";
import { SafePlaceCard } from "@/components/SafePlaceCard";
import { useSafePlaces } from "@/hooks/useSafePlaces";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import { SAFE_PLACE_CATEGORIES } from "@shared/types";

// The Safe places segment of the Events tab (epic P-40 slice SP-3): a city
// search + a category filter chip row + the admin-curated venue list. Filters
// are server-side; the list is offset-paginated (load-more). An OSM attribution
// footer satisfies the ODbL licence. Proximity ("near me") ordering ships with
// the map (SP-4). No coordinates are shown to the user.

export function SafePlacesList() {
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
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
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

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <MagnifyingGlass size={18} color={colors.textMuted} />
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
        <CategoryChip
          label={strings.safePlaces.filterAll}
          selected={category === null}
          onPress={() => setCategory(null)}
        />
        {SAFE_PLACE_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={strings.safePlaces.categories[c]}
            selected={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </ScrollView>

      <Text style={styles.disclaimer}>{strings.safePlaces.disclaimer}</Text>

      <FlatList
        testID="safe-places-list"
        style={styles.list}
        showsVerticalScrollIndicator={false}
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <SafePlaceCard place={item} />}
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
              <Text style={styles.attribution}>
                {strings.safePlaces.attribution}
              </Text>
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
    clearBtn: {
      padding: spacing.xs,
      marginLeft: spacing.xs,
    },
    filterScroll: { flexGrow: 0 },
    disclaimer: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xs,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    separator: { height: spacing.sm },
    footer: { paddingVertical: spacing.lg, alignItems: "center" },
    attribution: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: "center",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
