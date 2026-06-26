import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { Avatar } from "@/components/Avatar";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PublicUser } from "@shared/types";

// Blocked-users list (Profile → Blocked users). Data lives in useBlockedUsers;
// this screen is composition only. Block *initiation* is not here — it's
// deferred to where content surfaces a user (later slice).

export function BlockedUsersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { blocks, status, errorMessage, pendingIds, reload, unblock } =
    useBlockedUsers();

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.message}>
          {errorMessage ?? strings.profile.blockedLoadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.communities.retry} onPress={reload} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={blocks}
        keyExtractor={(user) => user.id}
        contentContainerStyle={
          blocks.length === 0 ? styles.listEmpty : styles.listContent
        }
        ListEmptyComponent={
          <Text style={styles.message}>{strings.profile.blockedEmpty}</Text>
        }
        renderItem={({ item }: { item: PublicUser }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Avatar
                uri={item.avatarUrl}
                name={item.displayName}
                size={40}
                borderRadius={radius.full}
              />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${strings.profile.unblock} ${item.displayName}`}
              disabled={pendingIds.includes(item.id)}
              onPress={() => unblock(item.id)}
              style={({ pressed }) => [
                styles.unblockButton,
                pressed && styles.unblockPressed,
                pendingIds.includes(item.id) && styles.unblockDisabled,
              ]}
            >
              <Text style={styles.unblockLabel}>{strings.profile.unblock}</Text>
            </Pressable>
          </View>
        )}
      />
      {errorMessage ? (
        <Text style={[styles.message, styles.inlineError]}>{errorMessage}</Text>
      ) : null}
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
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: {
      alignSelf: "stretch",
      marginTop: spacing.md,
    },
    message: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
    inlineError: {
      color: colors.danger,
      padding: spacing.md,
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
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    avatar: {
      marginRight: spacing.md,
    },
    name: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "600",
    },
    unblockButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    unblockPressed: {
      opacity: 0.85,
    },
    unblockDisabled: {
      opacity: 0.5,
    },
    unblockLabel: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
