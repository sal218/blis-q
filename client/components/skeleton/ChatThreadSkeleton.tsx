import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";
import { spacing, radius } from "@/constants/theme";

// Loading placeholder for the community chat thread (ChatThreadScreen): a column
// of alternating message-bubble blocks — incoming (left) and outgoing (right),
// varied widths/heights — so it reads as "a conversation is loading" while
// history fetches. Renders NO message content or identities (Article-9 safe) —
// just shaped blocks. A plain top-down column (the real inverted FlatList only
// mounts after load). Deterministic pattern (never Math.random) so renders are
// stable.

// { own: outgoing (right) vs incoming (left), bubble width, bubble height }
const BUBBLES: { own: boolean; width: number; height: number }[] = [
  { own: false, width: 200, height: 44 },
  { own: true, width: 150, height: 36 },
  { own: false, width: 240, height: 56 },
  { own: true, width: 110, height: 36 },
  { own: false, width: 170, height: 40 },
  { own: true, width: 210, height: 52 },
  { own: false, width: 130, height: 36 },
  { own: true, width: 180, height: 44 },
];

export function ChatThreadSkeleton() {
  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={styles.root} testID="chat-thread-skeleton">
      {BUBBLES.map((b, i) => (
        <View
          key={i}
          testID="chat-thread-skeleton-bubble"
          style={[styles.row, b.own ? styles.rowOwn : styles.rowOther]}
        >
          <SkeletonBlock
            width={b.width}
            height={b.height}
            borderRadius={radius.lg}
          />
        </View>
      ))}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    root: {
      flex: 1,
      padding: spacing.lg,
    },
    row: {
      flexDirection: "row",
      marginBottom: spacing.sm,
    },
    rowOwn: {
      justifyContent: "flex-end",
    },
    rowOther: {
      justifyContent: "flex-start",
    },
  });
}
