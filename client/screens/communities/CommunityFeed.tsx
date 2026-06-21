import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { PostCard } from "@/components/PostCard";
import { ReportPostModal } from "@/components/ReportPostModal";
import {
  useCommunityPosts,
  type ReportOutcome,
} from "@/hooks/useCommunityPosts";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { PostDTO } from "@shared/types";

// The "Feed" segment of the community detail screen: a community's posts, cursor-
// paginated, with pull-to-refresh and a per-post report flow. Owns its own
// FlatList (it is a flex child of the detail screen, never nested in a
// ScrollView). Data + report live in useCommunityPosts; this is composition only.

interface CommunityFeedProps {
  communityId: string;
}

export function CommunityFeed({ communityId }: CommunityFeedProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    posts,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    retry,
    report,
  } = useCommunityPosts(communityId);
  const [reportingPost, setReportingPost] = useState<PostDTO | null>(null);

  const showFullSpinner = status === "loading" && posts.length === 0;
  const showErrorState = status === "error" && posts.length === 0;

  const submitReport = async (reason: string): Promise<ReportOutcome> => {
    if (!reportingPost) return { ok: false, message: strings.errors.generic };
    const outcome = await report(reportingPost.id, reason);
    if (outcome.ok) Alert.alert(strings.posts.reportSuccess);
    return outcome;
  };

  if (showFullSpinner) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (showErrorState) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <View style={styles.retryButton}>
          <PrimaryButton label={strings.posts.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        testID="posts-feed"
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }: { item: PostDTO }) => (
          <PostCard post={item} onReport={setReportingPost} />
        )}
        contentContainerStyle={
          posts.length === 0 ? styles.listEmpty : styles.listContent
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
          <Text style={styles.emptyText}>{strings.posts.empty}</Text>
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
      <ReportPostModal
        visible={reportingPost !== null}
        onClose={() => setReportingPost(null)}
        onSubmit={submitReport}
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
      padding: spacing.lg,
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
      marginVertical: spacing.md,
    },
  });
}
