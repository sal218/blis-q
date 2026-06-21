import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { formatRelativeTime } from "@/lib/relativeTime";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PostDTO } from "@shared/types";

// A single post in a community feed: author avatar + name + relative time, the
// content, and a ⋯ overflow that opens the post action menu (report / delete).
// Pure presentation — it takes a post and an onMenu handler, owns no data.
// Deleted posts (server masks content to "[deleted]", author to null) render as
// a tombstone with no author and no ⋯.

interface PostCardProps {
  post: PostDTO;
  onMenu: (post: PostDTO) => void;
}

export function PostCard({ post, onMenu }: PostCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (post.deleted || !post.author) {
    return (
      <View style={[styles.card, styles.deletedCard]}>
        <Text style={styles.deletedText}>{strings.posts.deleted}</Text>
      </View>
    );
  }

  const { author } = post;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar
          uri={author.avatarUrl}
          name={author.displayName}
          size={40}
          borderRadius={radius.sm}
        />
        <View style={styles.headerText}>
          <Text style={styles.author} numberOfLines={1}>
            {author.displayName}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(post.createdAt)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.posts.moreActions}
          onPress={() => onMenu(post)}
          hitSlop={8}
          style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
        >
          <Text style={styles.moreGlyph}>⋯</Text>
        </Pressable>
      </View>
      <Text style={styles.content}>{post.content}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    deletedCard: {
      alignItems: "center",
    },
    deletedText: {
      color: colors.textMuted,
      fontSize: 14,
      fontStyle: "italic",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    headerText: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    author: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    time: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    more: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    morePressed: {
      opacity: 0.6,
    },
    moreGlyph: {
      color: colors.textMuted,
      fontSize: 20,
      fontWeight: "700",
    },
    content: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
