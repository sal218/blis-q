import { ScrollView, StyleSheet } from "react-native";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";
import {
  RAIL_CARD_WIDTH,
  RAIL_CARD_HEIGHT,
  RAIL_CARD_RADIUS,
} from "@/components/CommunityRailCard";
import { spacing } from "@/constants/theme";

// A horizontal rail of card-shaped placeholders, shown while the Home
// "Your communities" rail is loading. Mirrors the real rail: a horizontal
// ScrollView of the same-size cards (dimensions imported from CommunityRailCard
// so they can't drift) — scrollable so it never overflows narrow screens.

interface Props {
  count?: number;
}

export function RailSkeleton({ count = 3 }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      testID="rail-skeleton"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock
          key={i}
          testID="rail-skeleton-card"
          width={RAIL_CARD_WIDTH}
          height={RAIL_CARD_HEIGHT}
          borderRadius={RAIL_CARD_RADIUS}
          style={styles.card}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    paddingRight: spacing.lg,
    paddingVertical: spacing.xs,
  },
  card: {
    marginRight: spacing.md,
  },
});
