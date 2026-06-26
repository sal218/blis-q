import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Compact image-tile for a horizontal community rail (design ref: home-screen.png
// "Your communities"). The community image fills the tile (Avatar handles the
// image-or-initial fallback); name + member count sit at the bottom over a scrim
// so they stay legible on any image. Reusable for any community rail.

const TILE = 150;

interface CommunityRailCardProps {
  community: CommunityDTO;
  onPress: (id: string) => void;
}

export function CommunityRailCard({
  community,
  onPress,
}: CommunityRailCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={community.name}
      onPress={() => onPress(community.id)}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <Avatar
        uri={community.imageUrl}
        name={community.name}
        size={TILE}
        borderRadius={radius.lg}
      />
      <View style={styles.scrim}>
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {format(strings.communities.members, {
            count: community.memberCount,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: radius.lg,
      overflow: "hidden",
      marginRight: spacing.md,
    },
    pressed: {
      opacity: 0.85,
    },
    scrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    name: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    meta: {
      color: "#FFFFFF",
      fontSize: 12,
      marginTop: 2,
      opacity: 0.9,
    },
  });
}
