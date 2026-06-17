import { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ComingSoon } from "@/components/ComingSoon";
import { CommunitiesSection } from "@/screens/communities/CommunitiesSection";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Events tab landing screen. A segmented control switches between three
// subsections in this order: Events · Safe places · Communities. Only
// Communities is built this slice; the other two are themed placeholders
// (design refs: events-screen.png, event-safeplace-screen.png).

type Props = NativeStackScreenProps<EventsStackParamList, "EventsHome">;

const SEGMENT_EVENTS = 0;
const SEGMENT_SAFE_PLACES = 1;
const SEGMENT_COMMUNITIES = 2;

const SEGMENTS = [
  strings.events.tabEvents,
  strings.events.tabSafePlaces,
  strings.events.tabCommunities,
];

export function EventsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [segment, setSegment] = useState(SEGMENT_EVENTS);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>{strings.events.title}</Text>
      <SegmentedControl
        segments={SEGMENTS}
        selectedIndex={segment}
        onChange={setSegment}
      />
      <View style={styles.body}>
        {segment === SEGMENT_EVENTS && (
          <ComingSoon message={strings.events.eventsComingSoon} />
        )}
        {segment === SEGMENT_SAFE_PLACES && (
          <ComingSoon message={strings.events.safePlacesComingSoon} />
        )}
        {segment === SEGMENT_COMMUNITIES && (
          <CommunitiesSection
            onOpenCommunity={(id) =>
              navigation.navigate("CommunityDetail", { id })
            }
            onCreate={() => navigation.navigate("CreateCommunity")}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    body: {
      flex: 1,
    },
  });
}
