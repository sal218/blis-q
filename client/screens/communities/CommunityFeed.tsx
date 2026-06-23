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
import { ComposePostModal } from "@/components/ComposePostModal";
import { PostActionsSheet } from "@/components/PostActionsSheet";
import {
  useCommunityPosts,
  type PostActionOutcome,
} from "@/hooks/useCommunityPosts";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { PostDTO } from "@shared/types";

// The "Feed" segment of the community detail screen: a community's posts, cursor-
// paginated, with pull-to-refresh, a compose entry (members), and a per-post ⋯
// menu (report / delete-own). Owns its own FlatList (a flex child of the detail
// screen, never nested in a ScrollView). Data + mutations live in
// useCommunityPosts; this is composition only.

interface CommunityFeedProps {
  communityId: string;
  // Whether the caller can compose (a member with a resolved identity). Compose
  // is rendered only when this is true AND currentUserId is non-null.
  canCompose: boolean;
  currentUserId: string | null;
  // Whether the caller can moderate this community (moderator/admin) → the ⋯
  // sheet offers Delete on others' posts, not just their own.
  canModerate: boolean;
}

export function CommunityFeed({
  communityId,
  canCompose,
  currentUserId,
  canModerate,
}: CommunityFeedProps) {
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
    create,
    remove,
  } = useCommunityPosts(communityId);
  const [reportingPost, setReportingPost] = useState<PostDTO | null>(null);
  const [menuPost, setMenuPost] = useState<PostDTO | null>(null);
  const [composing, setComposing] = useState(false);

  const showFullSpinner = status === "loading" && posts.length === 0;
  const showErrorState = status === "error" && posts.length === 0;
  const showCompose = canCompose && currentUserId !== null;

  // Reconcile the open ⋯ sheet against the live list: `menuPost` is a snapshot
  // taken when the row was tapped, so if a refresh (or another delete) turns that
  // post into a tombstone — or drops it — while the sheet is open, resolve to the
  // current row and close the sheet for a deleted/missing post. Prevents a stale
  // Delete/Report action lingering over an already-deleted post.
  const activeMenuPost = menuPost
    ? (posts.find((p) => p.id === menuPost.id && !p.deleted) ?? null)
    : null;

  const submitReport = async (reason: string): Promise<PostActionOutcome> => {
    if (!reportingPost) return { ok: false, message: strings.errors.generic };
    const outcome = await report(reportingPost.id, reason);
    if (outcome.ok) Alert.alert(strings.posts.reportSuccess);
    return outcome;
  };

  const submitCompose = async (content: string): Promise<PostActionOutcome> =>
    create(content);

  // From the ⋯ sheet: close it, then open the report modal.
  const openReport = (post: PostDTO) => {
    setMenuPost(null);
    setReportingPost(post);
  };

  // From the ⋯ sheet: close it, confirm, then delete (own post). A delete
  // failure surfaces the mapped message.
  const confirmDelete = (post: PostDTO) => {
    setMenuPost(null);
    Alert.alert(
      strings.posts.deleteConfirmTitle,
      strings.posts.deleteConfirmBody,
      [
        { text: strings.common.cancel, style: "cancel" },
        {
          text: strings.posts.delete,
          style: "destructive",
          onPress: async () => {
            const outcome = await remove(post.id);
            if (!outcome.ok) Alert.alert(outcome.message);
          },
        },
      ],
    );
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
      {showCompose ? (
        <View style={styles.composeBar}>
          <PrimaryButton
            label={strings.posts.compose}
            onPress={() => setComposing(true)}
            variant="secondary"
          />
        </View>
      ) : null}
      <FlatList
        testID="posts-feed"
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }: { item: PostDTO }) => (
          <PostCard post={item} onMenu={setMenuPost} />
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
      <ComposePostModal
        visible={composing}
        onClose={() => setComposing(false)}
        onSubmit={submitCompose}
      />
      <PostActionsSheet
        post={activeMenuPost}
        currentUserId={currentUserId}
        canModerate={canModerate}
        onClose={() => setMenuPost(null)}
        onReport={openReport}
        onDelete={confirmDelete}
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
    composeBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
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
