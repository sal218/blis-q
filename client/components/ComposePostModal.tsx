import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PostActionOutcome } from "@/hooks/useCommunityPosts";

// Compose-a-post modal. A local themed multiline input bounded to the backend's
// content limit (1..2000, trimmed). onSubmit returns the outcome; the modal
// closes on success and shows the mapped error otherwise. Mirrors
// ReportPostModal's structure.

const MAX_POST_LENGTH = 2000;

interface ComposePostModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<PostActionOutcome>;
}

export function ComposePostModal({
  visible,
  onClose,
  onSubmit,
}: ComposePostModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setContent("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError(strings.posts.composeRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{strings.posts.composeTitle}</Text>

          <TextInput
            style={styles.input}
            value={content}
            onChangeText={setContent}
            placeholder={strings.posts.composePlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            maxLength={MAX_POST_LENGTH}
            textAlignVertical="top"
            editable={!submitting}
            accessibilityLabel={strings.posts.composeTitle}
          />

          <FormError message={error} />

          <PrimaryButton
            label={strings.posts.composeSubmit}
            onPress={submit}
            loading={submitting}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.common.cancel}
            onPress={onClose}
            disabled={submitting}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>
      </View>
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
      padding: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 130,
      color: colors.text,
      fontSize: 16,
      marginBottom: spacing.sm,
    },
    cancel: {
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    cancelText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
