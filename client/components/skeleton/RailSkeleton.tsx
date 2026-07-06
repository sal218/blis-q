import { ScrollView, StyleSheet } from "react-native";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";
import { spacing, radius } from "@/constants/theme";

// A horizontal rail of card-shaped placeholders, shown while the Home
// "Your communities" rail is loading. Mirrors the real rail: a horizontal
// ScrollView of 150×190 (radius.lg) cards (see CommunityRailCard) — scrollable so
// it never overflows narrow screens.

const CARD_WIDTH = 150;
const CARD_HEIGHT = 190;

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
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          borderRadius={radius.lg}
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
