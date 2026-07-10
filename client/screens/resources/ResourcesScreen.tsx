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
import { MagnifyingGlass, X, Lifebuoy } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { ResourceCard } from "@/components/ResourceCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useResources } from "@/hooks/useResources";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { RESOURCE_CATEGORIES, type ResourceCategory } from "@shared/types";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// Resources directory (P-37, one full-bleed surface — reworked from the old
// hub+list split per the on-device UX review). Owns its header (no native bar),
// an inline search box (one tap), a category filter chip row (filters in place,
// active chip auto-scrolled into view), a "Polecane" featured section in the
// default view, and the resource list. Filtering/search happen on this screen —
// the only pushed screen is the detail. Tapping a card ALWAYS opens the detail
// (never a direct external jump). The mockup's ⚡ quick-exit is NOT built (P-17).

type Props = NativeStackScreenProps<ResourcesStackParamList, "ResourcesHome">;

const ALL_KEY = "all";

export function ResourcesScreen({ navigation }: Props) {
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
  } = useResources();
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
  const openDetail = (id: string) =>
    navigation.navigate("ResourceDetail", { id });

  // Default view (no filter, no search) → a "Polecane" section + the rest below.
  const isDefault = category === null && search === "";
  const featured = isDefault ? items.filter((r) => r.featured) : [];
  const rest = isDefault ? items.filter((r) => !r.featured) : items;

  const emptyText = search
    ? strings.resources.emptySearch
    : category
      ? strings.resources.emptyCategory
      : strings.resources.empty;
  // Don't show "no resources" when the default view already shows featured cards.
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
        <Text style={styles.sectionTitle}>
          {strings.resources.featuredTitle}
        </Text>
        <View style={styles.featuredList}>
          {featured.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              onPress={(x) => openDetail(x.id)}
            />
          ))}
        </View>
        {rest.length > 0 ? (
          <Text style={styles.sectionTitle}>{strings.resources.allTitle}</Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {/* Own header — no native top bar. A Lifebuoy button (top-right) opens the
          crisis / safety page ("Pomoc w kryzysie"). */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{strings.resources.title}</Text>
          <Text style={styles.subtitle}>{strings.resources.subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.crisis.open}
          hitSlop={8}
          onPress={() => navigation.navigate("Crisis")}
          style={({ pressed }) => [
            styles.crisisBtn,
            pressed && styles.crisisBtnPressed,
          ]}
        >
          <Lifebuoy size={28} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <MagnifyingGlass size={20} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.resources.searchPlaceholder}
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
            accessibilityLabel={strings.resources.clear}
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
          strings.resources.filterAll,
          category === null,
          () => setCategory(null),
          ALL_KEY,
        )}
        {RESOURCE_CATEGORIES.map((c: ResourceCategory) =>
          renderPill(
            strings.resources.categories[c],
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
              {errorMessage ?? strings.resources.loadError}
            </Text>
            <View style={styles.fullWidth}>
              <PrimaryButton label={strings.resources.retry} onPress={retry} />
            </View>
          </View>
        ) : (
          <>
            <FlatList
              testID="resources-list"
              style={replacing ? styles.listDim : undefined}
              showsVerticalScrollIndicator={false}
              data={rest}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={featuredHeader}
              renderItem={({ item }) => (
                <ResourceCard
                  resource={item}
                  onPress={(r) => openDetail(r.id)}
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
                testID="resources-replacing"
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
    headerText: {
      flex: 1,
    },
    crisisBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    crisisBtnPressed: {
      opacity: 0.7,
    },
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
