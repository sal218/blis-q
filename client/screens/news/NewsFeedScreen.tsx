import { useEffect, useMemo, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { MagnifyingGlass, X } from "@/components/icons/PhosphorIcons";
import { CrisisHeaderButton } from "@/components/CrisisHeaderButton";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { NewsCard } from "@/components/NewsCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useNews } from "@/hooks/useNews";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { NEWS_CATEGORIES, type NewsCategory } from "@shared/types";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// News feed (P-31, design ref: assets/news-feed-*.png). Owns its header (no native
// bar) with a crisis-help button, an inline search box, a category filter chip
// row (active chip auto-scrolled into view), a "Na topie" featured hero in the
// default view, and the article list. Filtering/search happen on this screen; the
// only pushed screen is the article detail. Tapping a card ALWAYS opens the detail
// (never a direct external jump). Lives in the Resources/Wsparcie stack.

type Props = NativeStackScreenProps<ResourcesStackParamList, "NewsFeed">;

const ALL_KEY = "all";

export function NewsFeedScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
  } = useNews();
  const [query, setQuery] = useState("");

  // Horizontal chip scroller + each chip's measured x, so the active chip can be
  // scrolled into view (it can otherwise sit off-screen to the right).
  const chipScrollRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});

  // Live type-ahead: debounce the box → server-side search.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(id);
  }, [query, setSearch]);

  // Keep the active filter visible.
  useEffect(() => {
    const x = chipX.current[category ?? ALL_KEY];
    if (x !== undefined) {
      chipScrollRef.current?.scrollTo({
        x: Math.max(0, x - 16),
        animated: true,
      });
    }
  }, [category]);

  const clearSearch = () => {
    setQuery("");
    setSearch("");
  };
  const openArticle = (id: string) =>
    navigation.navigate("NewsArticle", { id });

  // Default view (no filter, no search) → a "Na topie" featured hero + the rest.
  const isDefault = category === null && search === "";
  const featured = isDefault ? items.filter((a) => a.featured) : [];
  const rest = isDefault ? items.filter((a) => !a.featured) : items;

  const emptyText = search
    ? strings.news.emptySearch
    : category
      ? strings.news.emptyCategory
      : strings.news.empty;
  // Don't show "no news" when the default view already shows the featured hero.
  const showEmpty = !(isDefault && featured.length > 0 && rest.length === 0);
  // A user-initiated filter/search replace is in flight while items are on screen.
  const replacing = status === "loading" && items.length > 0;

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
      onLayout={(e) => {
        chipX.current[key] = e.nativeEvent.layout.x;
      }}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  const featuredHeader =
    isDefault && featured.length > 0 ? (
      <View>
        <Text style={styles.sectionTitle}>{strings.news.featuredTitle}</Text>
        <View style={styles.featuredList}>
          {featured.map((a) => (
            <NewsCard
              key={a.id}
              article={a}
              featured
              onPress={(x) => openArticle(x.id)}
            />
          ))}
        </View>
        {rest.length > 0 ? (
          <Text style={styles.sectionTitle}>{strings.news.allTitle}</Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {/* Own header — no native top bar. A phone-call button (top-right) opens
          the crisis / safety page ("Pomoc w kryzysie"). */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{strings.news.title}</Text>
          <Text style={styles.subtitle}>{strings.news.subtitle}</Text>
        </View>
        <CrisisHeaderButton onPress={() => navigation.navigate("Crisis")} />
      </View>

      <View style={styles.searchBox}>
        <MagnifyingGlass size={20} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.news.searchPlaceholder}
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
            accessibilityLabel={strings.news.clear}
            style={styles.clearBtn}
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={chipScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {renderPill(
          strings.news.filterAll,
          category === null,
          () => setCategory(null),
          ALL_KEY,
        )}
        {NEWS_CATEGORIES.map((c: NewsCategory) =>
          renderPill(
            strings.news.categories[c],
            category === c,
            () => setCategory(c),
            c,
          ),
        )}
      </ScrollView>

      <View style={styles.content}>
        {status === "loading" && items.length === 0 ? (
          <CardListSkeleton count={6} />
        ) : status === "error" && items.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>
              {errorMessage ?? strings.news.loadError}
            </Text>
            <View style={styles.fullWidth}>
              <PrimaryButton label={strings.news.retry} onPress={retry} />
            </View>
          </View>
        ) : (
          <>
            <FlatList
              testID="news-list"
              style={replacing ? styles.listDim : undefined}
              showsVerticalScrollIndicator={false}
              data={rest}
              keyExtractor={(a) => a.id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={featuredHeader}
              renderItem={({ item }) => (
                <NewsCard article={item} onPress={(a) => openArticle(a.id)} />
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
              ListEmptyComponent={
                showEmpty ? (
                  <Text style={styles.emptyText}>{emptyText}</Text>
                ) : null
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : null
              }
            />
            {replacing ? (
              <View
                testID="news-replacing"
                style={styles.replacingOverlay}
                pointerEvents="none"
              >
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    headerText: { flex: 1 },
    title: {
      color: colors.text,
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 21,
      marginTop: spacing.xs,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.lg,
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
    clearBtn: { padding: spacing.xs, marginLeft: spacing.xs },
    filterScroll: { flexGrow: 0 },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
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
    pillText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
    pillTextActive: { color: "#FFFFFF" },
    content: { flex: 1 },
    listDim: { opacity: 0.4 },
    replacingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    separator: { height: spacing.md },
    featuredList: { gap: spacing.md },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    footer: { paddingVertical: spacing.lg },
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
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
