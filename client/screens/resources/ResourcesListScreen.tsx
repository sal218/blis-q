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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { MagnifyingGlass, X } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { ResourceCard } from "@/components/ResourceCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useResources } from "@/hooks/useResources";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { RESOURCE_CATEGORIES, type ResourceCategory } from "@shared/types";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// The Resources list (P-37): a client-side search box + a category filter chip
// row + the admin-curated content list. The category filter is server-side; the
// search filters the loaded pages client-side (the list endpoint has no
// ?search= — P-28). Tapping a card opens the detail screen (never the external
// link directly). Reached from the hub's category cards (preselected category),
// its "view all" link, and its search box.

type Props = NativeStackScreenProps<ResourcesStackParamList, "ResourcesList">;

export function ResourcesListScreen({ route, navigation }: Props) {
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
  } = useResources(route.params?.category ?? null);
  const [query, setQuery] = useState("");

  // Live type-ahead: debounce the box so the list filters as the user types.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(id);
  }, [query, setSearch]);

  const clearSearch = () => {
    setQuery("");
    setSearch("");
  };

  const openResource = (id: string) =>
    navigation.navigate("ResourceDetail", { id });

  // Empty-copy precedence: active SEARCH → search message; else active CATEGORY
  // → category message; else the plain empty.
  const emptyText = search
    ? strings.resources.emptySearch
    : category
      ? strings.resources.emptyCategory
      : strings.resources.empty;

  if (status === "loading" && items.length === 0) {
    return <CardListSkeleton showSearch count={6} />;
  }

  if (status === "error" && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMessage ?? strings.resources.loadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.resources.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  // Local premium filter pill (matches SafePlacesList — deliberately not the
  // shared CategoryChip, whose restyle would regress other surfaces).
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
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {renderPill(
          strings.resources.filterAll,
          category === null,
          () => setCategory(null),
          "all",
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

      <FlatList
        testID="resources-list"
        style={styles.list}
        showsVerticalScrollIndicator={false}
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ResourceCard resource={item} onPress={(r) => openResource(r.id)} />
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
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
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
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    separator: { height: spacing.md },
    footer: { paddingVertical: spacing.lg },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
