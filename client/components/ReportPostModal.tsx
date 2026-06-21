import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PostActionOutcome } from "@/hooks/useCommunityPosts";

// Report-a-post modal. A local themed multiline input (NOT the shared single-line
// TextField) bounded to the backend's reason limit. The helper copy is
// data-minimising — the reason is sent to moderators and stored — and the reason
// is never logged. onSubmit returns the outcome; the modal closes on success and
// shows the mapped error otherwise.

const MAX_REASON_LENGTH = 1000;

interface ReportPostModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<PostActionOutcome>;
}

export function ReportPostModal({
  visible,
  onClose,
  onSubmit,
}: ReportPostModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the field each time the modal opens.
  useEffect(() => {
    if (visible) {
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(strings.posts.reportReasonRequired);
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
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Tap the backdrop (outside the sheet) to dismiss. */}
        <Pressable style={styles.backdrop} onPress={onClose}>
          {/* Absorb taps inside the sheet so they don't close it. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{strings.posts.reportTitle}</Text>
            <Text style={styles.helper}>
              {strings.posts.reportReasonHelper}
            </Text>

            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder={strings.posts.reportReasonPlaceholder}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              maxLength={MAX_REASON_LENGTH}
              textAlignVertical="top"
              editable={!submitting}
              accessibilityLabel={strings.posts.reportTitle}
            />

            <FormError message={error} />

            <PrimaryButton
              label={strings.posts.reportSubmit}
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
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: {
      flex: 1,
    },
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
      marginBottom: spacing.xs,
    },
    helper: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 110,
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
