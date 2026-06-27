import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { useChats } from "@/hooks/useChats";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ChatStackParamList } from "@/navigation/AppTabs";
import type { ChatSummaryDTO } from "@shared/types";

// Messages inbox = the Chat tab root (design ref: chat-screen.png — community
// chats only this slice; DMs/Requests/search/unread are P-24c/P-26). Lists the
// caller's community chats with a last-message preview; tap → the chat thread.
// HTTP-only (useChats refetches on focus); no Realtime subscription here.

type Props = NativeStackScreenProps<ChatStackParamList, "ChatInbox">;

export function ChatInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { chats, status, errorMessage, refreshing, refresh, retry } =
    useChats();

  const open = (item: ChatSummaryDTO) =>
    navigation.navigate("ChatThread", {
      communityId: item.community.id,
      communityName: item.community.name,
      canModerate: item.role === "moderator" || item.role === "admin",
    });

  const preview = (item: ChatSummaryDTO): string => {
    const m = item.lastMessage;
    if (!m) return strings.chat.noMessagesYet;
    if (m.deleted) return strings.chat.deleted;
    return m.sender ? `${m.sender.displayName}: ${m.content}` : m.content;
  };

  if (status === "loading" && chats.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" && chats.length === 0) {
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
    <View style={styles.root}>
      <FlatList
        testID="chat-inbox"
        showsVerticalScrollIndicator={false}
        data={chats}
        keyExtractor={(c) => c.community.id}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
        }}
        ListHeaderComponent={
          <Text style={styles.title}>{strings.chat.messagesTitle}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.community.name}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Avatar
              uri={item.community.imageUrl}
              name={item.community.name}
              size={48}
              borderRadius={radius.sm}
            />
            <View style={styles.rowBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.community.name}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {preview(item)}
              </Text>
            </View>
          </Pressable>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{strings.chat.inboxEmpty}</Text>
        }
      />
    </View>
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
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
      marginBottom: spacing.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowBody: {
      flex: 1,
      marginLeft: spacing.md,
    },
    name: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    preview: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: 2,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
    },
  });
}
