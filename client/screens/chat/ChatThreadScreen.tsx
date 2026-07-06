import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { ChatThreadSkeleton } from "@/components/skeleton/ChatThreadSkeleton";
import { ReportPostModal } from "@/components/ReportPostModal";
import {
  useCommunityChat,
  type ChatActionOutcome,
} from "@/hooks/useCommunityChat";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ChatThreadParams } from "@/navigation/AppTabs";
import type { MessageDTO } from "@shared/types";

// Community chat THREAD (design ref: chat-groupchat-details-screen.png). An
// inverted message list (newest at the bottom) + an inline composer. History is
// HTTP; new messages arrive live via useCommunityChat. Reached from a community
// (Events stack) AND from the Messages inbox (Chat stack) — so it's typed against
// the shared params + only the navigation it uses (setOptions), stack-agnostic.

type Props = {
  route: { params: ChatThreadParams };
  navigation: { setOptions: (options: { title?: string }) => void };
};

const MAX_MESSAGE_LENGTH = 2000;

export function ChatThreadScreen({ route, navigation }: Props) {
  const { communityId, communityName, canModerate } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const {
    messages,
    status,
    errorMessage,
    loadingMore,
    loadMore,
    retry,
    send,
    remove,
    report,
  } = useCommunityChat(communityId, currentUserId);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportingMessage, setReportingMessage] = useState<MessageDTO | null>(
    null,
  );

  useEffect(() => {
    navigation.setOptions({ title: communityName });
  }, [navigation, communityName]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    const outcome = await send(text);
    setSending(false);
    if (!outcome.ok) {
      setDraft(text); // restore so the user can retry
      Alert.alert(outcome.message);
    }
  }, [draft, sending, send]);

  const confirmDelete = useCallback(
    (message: MessageDTO) => {
      Alert.alert(
        strings.chat.deleteConfirmTitle,
        strings.chat.deleteConfirmBody,
        [
          { text: strings.common.cancel, style: "cancel" },
          {
            text: strings.chat.delete,
            style: "destructive",
            onPress: async () => {
              const outcome = await remove(message.id);
              if (!outcome.ok) Alert.alert(outcome.message);
            },
          },
        ],
      );
    },
    [remove],
  );

  // Long-press a (non-deleted) message → report, and delete when the caller is
  // the sender or a community mod/admin (mirrors the server's authorization).
  const onLongPress = useCallback(
    (message: MessageDTO) => {
      if (message.deleted) return;
      const canDelete = message.sender?.id === currentUserId || canModerate;
      const buttons: {
        text: string;
        style?: "cancel" | "destructive";
        onPress?: () => void;
      }[] = [
        {
          text: strings.chat.report,
          onPress: () => setReportingMessage(message),
        },
      ];
      if (canDelete) {
        buttons.push({
          text: strings.chat.delete,
          style: "destructive",
          onPress: () => confirmDelete(message),
        });
      }
      buttons.push({ text: strings.common.cancel, style: "cancel" });
      Alert.alert(strings.chat.messageActions, undefined, buttons);
    },
    [currentUserId, canModerate, confirmDelete],
  );

  const submitReport = useCallback(
    async (reason: string): Promise<ChatActionOutcome> => {
      if (!reportingMessage) {
        return { ok: false, message: strings.errors.generic };
      }
      const outcome = await report(reportingMessage.id, reason);
      if (outcome.ok) Alert.alert(strings.chat.reportSuccess);
      return outcome;
    },
    [reportingMessage, report],
  );

  const renderItem = useCallback(
    ({ item }: { item: MessageDTO }) => {
      const isOwn = !item.deleted && item.sender?.id === currentUserId;
      return (
        <Pressable
          onLongPress={() => onLongPress(item)}
          accessibilityRole="button"
          accessibilityLabel={strings.chat.messageActions}
          style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}
        >
          <View
            style={[
              styles.bubble,
              item.deleted
                ? styles.bubbleDeleted
                : isOwn
                  ? styles.bubbleOwn
                  : styles.bubbleOther,
            ]}
          >
            {!isOwn && !item.deleted && item.sender ? (
              <Text style={styles.senderName}>{item.sender.displayName}</Text>
            ) : null}
            <Text
              style={
                item.deleted
                  ? styles.deletedText
                  : isOwn
                    ? styles.textOwn
                    : styles.textOther
              }
            >
              {item.deleted ? strings.chat.deleted : item.content}
            </Text>
          </View>
        </Pressable>
      );
    },
    [currentUserId, onLongPress, styles],
  );

  if (status === "loading" && messages.length === 0) {
    return <ChatThreadSkeleton />;
  }

  if (status === "error" && messages.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.errorText}>
          {errorMessage ?? strings.chat.loadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.chat.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <FlatList
        testID="chat-thread"
        inverted
        showsVerticalScrollIndicator={false}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={
          messages.length === 0 ? styles.listEmpty : styles.listContent
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{strings.chat.empty}</Text>
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

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={strings.chat.composerPlaceholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          editable={currentUserId !== null}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.chat.send}
          onPress={onSend}
          disabled={!draft.trim() || sending}
          style={({ pressed }) => [
            styles.sendButton,
            (!draft.trim() || sending) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          <Text style={styles.sendLabel}>{strings.chat.send}</Text>
        </Pressable>
      </View>

      <ReportPostModal
        visible={reportingMessage !== null}
        onClose={() => setReportingMessage(null)}
        onSubmit={submitReport}
        title={strings.chat.reportTitle}
        placeholder={strings.chat.reportReasonPlaceholder}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    listContent: {
      padding: spacing.lg,
    },
    listEmpty: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      // Inverted list flips children; un-flip the empty state so it reads upright.
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
    footerSpinner: {
      marginVertical: spacing.md,
    },
    row: {
      marginBottom: spacing.sm,
      flexDirection: "row",
    },
    rowOwn: {
      justifyContent: "flex-end",
    },
    rowOther: {
      justifyContent: "flex-start",
    },
    bubble: {
      maxWidth: "80%",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
    },
    bubbleOwn: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: radius.sm,
    },
    bubbleOther: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: radius.sm,
    },
    bubbleDeleted: {
      backgroundColor: colors.surface,
      opacity: 0.7,
    },
    senderName: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 2,
    },
    textOwn: {
      color: "#FFFFFF",
      fontSize: 15,
    },
    textOther: {
      color: colors.text,
      fontSize: 15,
    },
    deletedText: {
      color: colors.textMuted,
      fontSize: 15,
      fontStyle: "italic",
    },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      color: colors.text,
      fontSize: 16,
      marginRight: spacing.sm,
    },
    sendButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonPressed: {
      opacity: 0.85,
    },
    sendLabel: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
