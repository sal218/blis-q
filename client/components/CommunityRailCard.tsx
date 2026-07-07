import { useMemo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { UsersThree } from "@/components/icons/PhosphorIcons";
import { strings, format } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";

// Premium glass content tile for the Home "Your communities" rail. A landscape
// card that is a SELF-CONTAINED colored surface (so it looks identical in light
// + dark): a full-bleed community photo (with a soft bottom gradient for text),
// or — with no photo — a code-drawn placeholder: a deep indigo→violet gradient,
// a radial corner glow, a faint glass tint, and the large initial. A translucent
// member-count pill sits top-right; the name + member count sit at the bottom
// over the darkened surface. A hairline top highlight reads like light on glass.
//
// The card dimensions are EXPORTED so the rail skeleton (RailSkeleton) and the
// dashed "add community" affordance (HomeScreen) stay in lock-step — they must
// not drift from the real tile.

export const RAIL_CARD_WIDTH = 264;
export const RAIL_CARD_HEIGHT = 160;
export const RAIL_CARD_RADIUS = 20;

const NAME_WHITE = "#FFFFFF";
const META_LAVENDER = "#C4B5FD"; // muted lavender, legible on the dark surface

interface CommunityRailCardProps {
  community: CommunityDTO;
  onPress: (id: string) => void;
}

// Code-only placeholder background: indigo→deep-violet gradient + a radial glow
// in the top-left corner. Drawn once per image-less tile.
function PlaceholderBackground() {
  return (
    <Svg
      width={RAIL_CARD_WIDTH}
      height={RAIL_CARD_HEIGHT}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id="crc-bg" x1="0" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#4A3AA6" />
          <Stop offset="1" stopColor="#1B1836" />
        </LinearGradient>
        <RadialGradient id="crc-glow" cx="0.2" cy="0.08" r="0.9">
          <Stop offset="0" stopColor="#9B87FF" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#9B87FF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect
        width={RAIL_CARD_WIDTH}
        height={RAIL_CARD_HEIGHT}
        fill="url(#crc-bg)"
      />
      <Rect
        width={RAIL_CARD_WIDTH}
        height={RAIL_CARD_HEIGHT}
        fill="url(#crc-glow)"
      />
    </Svg>
  );
}

// Soft bottom gradient over a photo so the name/count stay legible.
function ImageScrim() {
  return (
    <Svg
      width={RAIL_CARD_WIDTH}
      height={RAIL_CARD_HEIGHT}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id="crc-scrim" x1="0" y1="0.4" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.7" />
        </LinearGradient>
      </Defs>
      <Rect
        width={RAIL_CARD_WIDTH}
        height={RAIL_CARD_HEIGHT}
        fill="url(#crc-scrim)"
      />
    </Svg>
  );
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
        <>
          <Image
            source={{ uri: community.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <ImageScrim />
        </>
      ) : (
        <>
          <PlaceholderBackground />
          <View style={styles.glassTint} />
          <View style={styles.initialWrap} pointerEvents="none">
            <Text style={styles.initial}>
              {community.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </>
      )}

      {/* Hairline top highlight — light reflecting on glass. */}
      <View style={styles.topHighlight} pointerEvents="none" />

      {/* Member-count pill, top-right. */}
      <View style={styles.pill}>
        <UsersThree size={13} color={NAME_WHITE} />
        <Text style={styles.pillText}>{community.memberCount}</Text>
      </View>

      <View style={styles.bottom}>
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
      width: RAIL_CARD_WIDTH,
      height: RAIL_CARD_HEIGHT,
      borderRadius: RAIL_CARD_RADIUS,
      overflow: "hidden",
      marginRight: spacing.md,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      backgroundColor: colors.surface,
    },
    pressed: {
      opacity: 0.9,
    },
    // Faint glass tint over the placeholder gradient.
    glassTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(255,255,255,0.045)",
    },
    topHighlight: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: "rgba(255,255,255,0.22)",
    },
    // Large initial, in the upper area (clear of the bottom text).
    initialWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 44,
    },
    initial: {
      color: NAME_WHITE,
      fontSize: 60,
      fontWeight: "800",
      opacity: 0.95,
    },
    pill: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    pillText: {
      color: NAME_WHITE,
      fontSize: 12,
      fontWeight: "700",
    },
    bottom: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    name: {
      color: NAME_WHITE,
      fontSize: 17,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    meta: {
      color: META_LAVENDER,
      fontSize: 12.5,
      fontWeight: "600",
      marginTop: 2,
    },
  });
}
