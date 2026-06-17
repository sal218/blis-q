import { useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CommunityCard } from "@/components/CommunityCard";
import { useCommunitiesList } from "@/hooks/useCommunitiesList";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Communities browse list — the Events tab's "Communities" segment. Design ref:
// assets/event-communities-screen.png. Data lives in useCommunitiesList; this
// component is composition only (search box, create button, list of
// CommunityCard, and the loading/empty/error states).

interface CommunitiesSectionProps {
  onOpenCommunity: (id: string) => void;
  onCreate: () => void;
}

export function CommunitiesSection({
  onOpenCommunity,
  onCreate,
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

  const showFullSpinner = status === "loading" && communities.length === 0;
  const showErrorState = status === "error" && communities.length === 0;

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
            <PrimaryButton label={strings.communities.retry} onPress={retry} />
          </View>
        </View>
      ) : (
        <FlatList
          testID="communities-list"
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
  });
}
