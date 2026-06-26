import { useMemo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Portrait image-tile for the Home "Your communities" rail (design ref:
// home-screen.png). The community photo fills the tile; the name + member count
// sit at the bottom over a dark scrim so they stay legible. No photo → a themed
// initial fallback. Reusable for any community rail.

const WIDTH = 150;
const HEIGHT = 190;

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
      {community.imageUrl ? (
        <Image
          source={{ uri: community.imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.initial}>
            {community.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      width: WIDTH,
      height: HEIGHT,
      borderRadius: radius.lg,
      overflow: "hidden",
      marginRight: spacing.md,
      backgroundColor: colors.surface,
    },
    pressed: {
      opacity: 0.85,
    },
    fallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    initial: {
      color: "#FFFFFF",
      fontSize: 56,
      fontWeight: "700",
    },
    scrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    name: {
      color: "#FFFFFF",
      fontSize: 15,
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
