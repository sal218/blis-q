import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
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
import { MagnifyingGlass } from "@/components/icons/PhosphorIcons";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { useChats } from "@/hooks/useChats";
import { formatInboxTime } from "@/lib/relativeTime";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ChatStackParamList } from "@/navigation/AppTabs";
import type { ChatSummaryDTO } from "@shared/types";

// Messages inbox = the Chat tab root (design ref: chat-screen.png — community
// chats only). Pinned header (title + search) + a list of the caller's community
// chats: circular avatar, name + timestamp, last-message preview. Tap → thread.
// HTTP-only (useChats refetches silently on focus); search filters the loaded
// list client-side. Unread badges / presence / DM-Requests chips are P-24c/P-26.

type Props = NativeStackScreenProps<ChatStackParamList, "ChatInbox">;

const AVATAR_SIZE = 52;

export function ChatInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { chats, status, errorMessage, refreshing, refresh, retry } =
    useChats();
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? chats.filter((c) => c.community.name.toLowerCase().includes(trimmed))
    : chats;

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
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>{strings.chat.messagesTitle}</Text>
        <View style={styles.searchBox}>
          <MagnifyingGlass size={18} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={strings.chat.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        testID="chat-inbox"
        showsVerticalScrollIndicator={false}
        data={filtered}
        keyExtractor={(c) => c.community.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
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
              size={AVATAR_SIZE}
              borderRadius={radius.full}
            />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.community.name}
                </Text>
                {item.lastMessage ? (
                  <Text style={styles.time}>
                    {formatInboxTime(item.lastMessage.createdAt)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {preview(item)}
              </Text>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {trimmed ? strings.chat.searchEmpty : strings.chat.inboxEmpty}
          </Text>
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
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
      marginBottom: spacing.md,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    search: {
      flex: 1,
      paddingVertical: spacing.sm,
      marginLeft: spacing.sm,
      color: colors.text,
      fontSize: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    // Faint, theme-aware divider between rows, inset to start under the text
    // (aligns past the avatar). colors.border adapts to light/dark.
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: AVATAR_SIZE + spacing.md,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowBody: {
      flex: 1,
      marginLeft: spacing.md,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "baseline",
    },
    name: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginRight: spacing.sm,
    },
    time: {
      color: colors.textMuted,
      fontSize: 12,
    },
    preview: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: 2,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      paddingTop: spacing.md,
    },
  });
}
