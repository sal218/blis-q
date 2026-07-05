import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  Animated,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { MagnifyingGlass, X } from "@/components/icons/PhosphorIcons";
import { useJoinedCommunities } from "@/hooks/useJoinedCommunities";
import { strings, memberLabel } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Slide-up sheet for choosing which community to create an event in (Option 1 —
// events are community-scoped). Lists the caller's joined communities (all of
// them, via useJoinedCommunities) with a client-side name filter, and navigates
// to the existing CreateEvent route on pick. No new backend surface.

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (communityId: string) => void;
}

export function CommunityPickerSheet({ visible, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { communities, status, retry } = useJoinedCommunities(visible);
  const [query, setQuery] = useState("");

  const translateY = useRef(new Animated.Value(1)).current; // 0 open, 1 hidden
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setQuery(""); // fresh each open
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(1);
      backdrop.setValue(0);
    }
  }, [visible, translateY, backdrop]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => c.name.toLowerCase().includes(q));
  }, [communities, query]);

  const panelShift = translateY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 600],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              paddingBottom: insets.bottom + spacing.lg,
              transform: [{ translateY: panelShift }],
            },
          ]}
        >
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {strings.communities.pickCommunityTitle}
              </Text>
              <Text style={styles.subtitle}>
                {strings.communities.pickCommunitySubtitle}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.communities.pickCommunityClose}
              hitSlop={8}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {status === "ready" && communities.length > 0 ? (
            <View style={styles.searchBox}>
              <MagnifyingGlass size={18} color={colors.textMuted} />
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={strings.communities.searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          {status === "loading" ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : status === "error" ? (
            <View style={styles.centered}>
              <Text style={styles.muted}>{strings.communities.loadError}</Text>
              <Pressable onPress={retry} hitSlop={8}>
                <Text style={styles.retry}>{strings.communities.retry}</Text>
              </Pressable>
            </View>
          ) : communities.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.muted}>
                {strings.communities.pickCommunityEmpty}
              </Text>
            </View>
          ) : (
            <FlatList
              testID="community-picker-list"
              data={filtered}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={[styles.muted, styles.listEmpty]}>
                  {strings.communities.emptySearch}
                </Text>
              }
              renderItem={({ item }: { item: CommunityDTO }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  onPress={() => onPick(item.id)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Avatar
                    uri={item.imageUrl}
                    name={item.name}
                    size={40}
                    borderRadius={radius.sm}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {memberLabel(item.memberCount)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    panel: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: "80%",
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    headerText: { flex: 1, paddingRight: spacing.md },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    search: {
      flex: 1,
      paddingVertical: spacing.md,
      marginLeft: spacing.sm,
      color: colors.text,
      fontSize: 16,
    },
    list: { flexGrow: 0 },
    listEmpty: { textAlign: "center", paddingVertical: spacing.lg },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    rowPressed: { opacity: 0.6 },
    rowBody: { flex: 1 },
    rowName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    rowMeta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
    retry: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
