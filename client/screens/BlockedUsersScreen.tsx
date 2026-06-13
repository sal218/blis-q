import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { listBlocks, unblockUser } from "@/lib/api/safety";
import { blocksApiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { PublicUser } from "@shared/types";

// Blocked-users list (Profile → Blocked users). Loads the caller's blocks and
// unblocks a user (removing the row on success). Block *initiation* is not here
// — it's deferred to where content surfaces a user (later slice). All network
// access goes through @/lib/api/safety (this screen never calls fetch).

type Status = "loading" | "ready" | "error";

export function BlockedUsersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [blocks, setBlocks] = useState<PublicUser[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Ids currently being unblocked (so we can disable just that row's button).
  const [pending, setPending] = useState<string[]>([]);

  const load = useCallback(async () => {
    setStatus("loading");
    const res = await listBlocks();
    if (res.ok) {
      setBlocks(res.data);
      setStatus("ready");
    } else {
      setErrorMessage(blocksApiErrorMessage(res.error));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUnblock = async (userId: string) => {
    setPending((p) => [...p, userId]);
    setErrorMessage(null);
    const res = await unblockUser(userId);
    setPending((p) => p.filter((id) => id !== userId));
    if (res.ok) {
      setBlocks((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setErrorMessage(blocksApiErrorMessage(res.error));
    }
  };

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
          <PrimaryButton label={strings.communities.retry} onPress={load} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={blocks}
        keyExtractor={(u) => u.id}
        contentContainerStyle={
          blocks.length === 0 ? styles.listEmpty : styles.listContent
        }
        ListEmptyComponent={
          <Text style={styles.message}>{strings.profile.blockedEmpty}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${strings.profile.unblock} ${item.displayName}`}
              disabled={pending.includes(item.id)}
              onPress={() => onUnblock(item.id)}
              style={({ pressed }) => [
                styles.unblockButton,
                pressed && styles.unblockPressed,
                pending.includes(item.id) && styles.unblockDisabled,
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
      backgroundColor: colors.background,
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
      width: 40,
      height: 40,
      borderRadius: radius.full,
      marginRight: spacing.md,
    },
    avatarFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    avatarLetter: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
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
