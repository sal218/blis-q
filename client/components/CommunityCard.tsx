import { useMemo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { strings, memberLabel } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// A single community row in the browse list (design ref:
// assets/event-communities-screen.png). A raised card: the community image (or a
// premium gradient placeholder with the initial) on the left, then the name, a
// muted member-count line and a 2-line description, with a Join/Joined status
// pill on the right. Pure presentation — it takes a community and an onPress and
// owns no data. The pill is DISPLAY-ONLY: tapping anywhere on the card opens the
// detail screen (where join/leave already lives) — no inline join here.

const THUMB = 68;

interface CommunityCardProps {
  community: CommunityDTO;
  onPress: (id: string) => void;
}

export function CommunityCard({ community, onPress }: CommunityCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isMember = community.membership !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={community.name}
      onPress={() => onPress(community.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {community.imageUrl ? (
        <Image
          testID="community-thumb"
          source={{ uri: community.imageUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View testID="community-thumb-placeholder" style={styles.thumb}>
          <Svg width={THUMB} height={THUMB} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="community-thumb" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.primary} />
                <Stop offset="1" stopColor={colors.accent} />
              </LinearGradient>
            </Defs>
            <Rect
              width={THUMB}
              height={THUMB}
              rx={radius.md}
              fill="url(#community-thumb)"
            />
          </Svg>
          <Text style={styles.thumbInitial}>
            {community.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        {/* Member count only — the reference's "• N online" is omitted because no
            presence data exists yet (never fabricate); an online count can append
            here later (P-24c/P-28). */}
        <Text style={styles.meta} numberOfLines={1}>
          {memberLabel(community.memberCount)}
        </Text>
        {community.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {community.description}
          </Text>
        ) : null}
      </View>

      <View
        style={[styles.pill, isMember ? styles.pillMember : styles.pillJoin]}
      >
        <Text style={styles.pillText}>
          {isMember ? strings.communities.joined : strings.communities.join}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadow,
      shadowOpacity: 0.06,
    },
    cardPressed: {
      opacity: 0.85,
    },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    thumbInitial: {
      color: "#FFFFFF",
      fontSize: Math.round(THUMB * 0.4),
      fontWeight: "800",
    },
    body: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 2,
    },
    description: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    pillJoin: {
      borderColor: colors.primary,
      backgroundColor: "transparent",
    },
    pillMember: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "1A", // subtle brand tint for "joined"
    },
    pillText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}
