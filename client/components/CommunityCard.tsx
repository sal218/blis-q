import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// A single community row in the browse list: avatar, name, member count,
// description, and a "joined" badge when the caller is a member. Pure
// presentation — it takes a community and an onPress, and owns no data.

interface CommunityCardProps {
  community: CommunityDTO;
  onPress: (id: string) => void;
}

export function CommunityCard({ community, onPress }: CommunityCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={community.name}
      onPress={() => onPress(community.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.avatar}>
        <Avatar
          uri={community.imageUrl}
          name={community.name}
          size={48}
          borderRadius={radius.sm}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={styles.meta}>
          {format(strings.communities.members, {
            count: community.memberCount,
          })}
        </Text>
        {community.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {community.description}
          </Text>
        ) : null}
      </View>
      {community.membership ? (
        <Text style={styles.joinedBadge}>{strings.communities.joined}</Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardPressed: {
      opacity: 0.85,
    },
    avatar: {
      marginRight: spacing.md,
    },
    body: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    meta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    description: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    joinedBadge: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "600",
      marginLeft: spacing.sm,
    },
  });
}
