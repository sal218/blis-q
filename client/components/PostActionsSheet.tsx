import { useMemo } from "react";
import { Modal, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PostDTO } from "@shared/types";

// Bottom-sheet action menu for a post's ⋯ overflow. Report is always offered;
// Delete is offered when the post is the caller's own (post.author?.id ===
// currentUserId) OR the caller can moderate this community (a moderator/admin).
// `canModerate` must mirror the server's softDeletePost authorization (author or
// community moderator/admin — NOT global app admin), so the action never 403s.
// Open when `post` is non-null; the parent owns the report/delete flows.

interface PostActionsSheetProps {
  post: PostDTO | null;
  currentUserId: string | null;
  // The caller is a moderator/admin of this community → may delete others' posts.
  canModerate: boolean;
  onClose: () => void;
  onReport: (post: PostDTO) => void;
  onDelete: (post: PostDTO) => void;
}

export function PostActionsSheet({
  post,
  currentUserId,
  canModerate,
  onClose,
  onReport,
  onDelete,
}: PostActionsSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isOwn = post?.author?.id != null && post.author.id === currentUserId;
  const canDelete = isOwn || canModerate;

  return (
    <Modal
      visible={post !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            // Lift the rows off the bottom edge / home indicator so they're
            // comfortable to tap (the sheet sat too low on devices with a gesture bar).
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.posts.report}
            onPress={() => post && onReport(post)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowText}>{strings.posts.report}</Text>
          </Pressable>

          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.posts.delete}
              onPress={() => post && onDelete(post)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={[styles.rowText, styles.danger]}>
                {strings.posts.delete}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.common.cancel}
            onPress={onClose}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingVertical: spacing.sm,
    },
    row: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      alignItems: "center",
    },
    rowPressed: {
      opacity: 0.6,
    },
    rowText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "600",
    },
    danger: {
      color: colors.danger,
    },
    cancelText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
