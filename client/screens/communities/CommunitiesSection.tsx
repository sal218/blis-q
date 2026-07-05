import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import {
  MagnifyingGlass,
  X,
  UsersThree,
} from "@/components/icons/PhosphorIcons";
import { CommunityCard } from "@/components/CommunityCard";
import { CommunitiesCreateFab } from "@/components/CommunitiesCreateFab";
import { CommunityPickerSheet } from "@/components/CommunityPickerSheet";
import { useCommunitiesList } from "@/hooks/useCommunitiesList";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Communities browse list — the Events tab's "Communities" segment. Design ref:
// assets/event-communities-screen.png. Data lives in useCommunitiesList; this
// component is composition only: a premium search box, the list of
// CommunityCards, loading/empty/error states, and the bottom-right create FAB
// (speed-dial → Create community / Create event). Creation reuses the existing
// CreateCommunity + CreateEvent routes — no functionality change.

interface CommunitiesSectionProps {
  onOpenCommunity: (id: string) => void;
  onCreateCommunity: () => void;
  onCreateEvent: (communityId: string) => void;
}

export function CommunitiesSection({
  onOpenCommunity,
  onCreateCommunity,
  onCreateEvent,
}: CommunitiesSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    query,
    setQuery,
    debouncedQuery,
    communities,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    retry,
  } = useCommunitiesList();
  const [pickerVisible, setPickerVisible] = useState(false);

  const showFullSpinner = status === "loading" && communities.length === 0;
  const showErrorState = status === "error" && communities.length === 0;

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <MagnifyingGlass size={20} color={colors.textMuted} />
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
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={strings.communities.searchPlaceholder}
            style={styles.clearBtn}
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {showFullSpinner ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : showErrorState ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <View style={styles.retryButton}>
            <PrimaryButton label={strings.communities.retry} onPress={retry} />
          </View>
        </View>
      ) : (
        <FlatList
          testID="communities-list"
          showsVerticalScrollIndicator={false}
          data={communities}
          keyExtractor={(community) => community.id}
          renderItem={({ item }: { item: CommunityDTO }) => (
            <CommunityCard community={item} onPress={onOpenCommunity} />
          )}
          contentContainerStyle={
            communities.length === 0 ? styles.listEmpty : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <UsersThree size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyText}>
                {debouncedQuery
                  ? strings.communities.emptySearch
                  : strings.communities.empty}
              </Text>
              {debouncedQuery ? null : (
                <Text style={styles.emptyEncourage}>
                  {strings.communities.emptyEncourage}
                </Text>
              )}
            </View>
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

      <CommunitiesCreateFab
        onCreateCommunity={onCreateCommunity}
        onCreateEvent={() => setPickerVisible(true)}
      />

      <CommunityPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPick={(communityId) => {
          setPickerVisible(false);
          onCreateEvent(communityId);
        }}
      />
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
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
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
    // Extra bottom padding so the last card clears the bottom-right FAB.
    listContent: {
      paddingBottom: 96,
    },
    listEmpty: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    emptyState: {
      alignItems: "center",
      gap: spacing.sm,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      backgroundColor: colors.primary + "1A",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    emptyText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },
    emptyEncourage: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
    },
    footerSpinner: {
      paddingVertical: spacing.md,
    },
  });
}
