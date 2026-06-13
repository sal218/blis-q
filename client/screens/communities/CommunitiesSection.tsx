import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { listCommunities } from "@/lib/api/communities";
import { communityApiErrorMessage } from "@/lib/messages";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Communities browse list — rendered inside the Events tab's "Communities"
// segment. Search (debounced) + offset load-more. Design ref:
// assets/event-communities-screen.png. All network access goes through
// @/lib/api/communities (this screen never calls fetch).
//
// Stale-response guard (Codex refinement #2): every fetch bumps a sequence
// counter; a response is applied only if its sequence is still the latest, so a
// slow response for an old search can't overwrite a newer one.

type Props = {
  onOpenCommunity: (id: string) => void;
  onCreate: () => void;
};

type LoadMode = "replace" | "refresh" | "more";
type Status = "loading" | "ready" | "error";

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

export function CommunitiesSection({ onOpenCommunity, onCreate }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<CommunityDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Monotonic request id — the latest wins; older in-flight responses are dropped.
  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    async (targetPage: number, search: string, mode: LoadMode) => {
      const seq = ++requestSeq.current;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setStatus("loading");

      const res = await listCommunities({
        page: targetPage,
        pageSize: PAGE_SIZE,
        search,
      });

      if (mode === "more") setLoadingMore(false);
      else if (mode === "refresh") setRefreshing(false);

      // A newer request started while this was in flight — discard its result.
      // (The transient flags above are reset regardless, so a superseded
      // load-more never leaves the footer spinner stuck on.)
      if (seq !== requestSeq.current) return;

      if (res.ok) {
        const data = res.data;
        setItems((prev) =>
          mode === "more" ? [...prev, ...data.data] : data.data,
        );
        setPage(data.page);
        setTotalPages(data.totalPages);
        setErrorMessage(null);
        setStatus("ready");
      } else if (mode !== "more") {
        // Load-more failures keep the existing list; initial/refresh/search
        // surface the error state.
        setErrorMessage(
          communityApiErrorMessage(res.error, strings.errors.generic),
        );
        setStatus("error");
      }
    },
    [],
  );

  // Debounce the raw query into debouncedQuery.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // (Re)load page 1 whenever the debounced search changes — also the initial load.
  useEffect(() => {
    fetchPage(1, debouncedQuery, "replace");
  }, [debouncedQuery, fetchPage]);

  const onEndReached = () => {
    if (loadingMore || status !== "ready" || page >= totalPages) return;
    fetchPage(page + 1, debouncedQuery, "more");
  };

  const renderItem = ({ item }: { item: CommunityDTO }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={() => onOpenCommunity(item.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardMeta}>
          {format(strings.communities.members, { count: item.memberCount })}
        </Text>
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
      {item.membership ? (
        <Text style={styles.joinedBadge}>{strings.communities.joined}</Text>
      ) : null}
    </Pressable>
  );

  const showFullSpinner = status === "loading" && items.length === 0;
  const showErrorState = status === "error" && items.length === 0;

  return (
    <View style={styles.root}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={strings.communities.searchPlaceholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={strings.communities.searchPlaceholder}
      />
      <View style={styles.createButton}>
        <PrimaryButton
          label={strings.communities.create}
          onPress={onCreate}
          variant="secondary"
        />
      </View>

      {showFullSpinner ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : showErrorState ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <View style={styles.retryButton}>
            <PrimaryButton
              label={strings.communities.retry}
              onPress={() => fetchPage(1, debouncedQuery, "replace")}
            />
          </View>
        </View>
      ) : (
        <FlatList
          testID="communities-list"
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={
            items.length === 0 ? styles.listEmpty : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPage(1, debouncedQuery, "refresh")}
              tintColor={colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {debouncedQuery
                ? strings.communities.emptySearch
                : strings.communities.empty}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerSpinner}
                color={colors.primary}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    search: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 46,
      color: colors.text,
      fontSize: 16,
    },
    createButton: {
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    retryButton: {
      alignSelf: "stretch",
    },
    listContent: {
      paddingBottom: spacing.xl,
    },
    listEmpty: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
    footerSpinner: {
      paddingVertical: spacing.md,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardPressed: {
      opacity: 0.85,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: radius.sm,
      marginRight: spacing.md,
    },
    avatarFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    avatarLetter: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "700",
    },
    cardBody: {
      flex: 1,
    },
    cardName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    cardMeta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    cardDescription: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    joinedBadge: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "600",
      marginLeft: spacing.sm,
    },
  });
}
