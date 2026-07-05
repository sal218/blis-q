import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SavedEventsList } from "@/screens/events/SavedEventsList";
import { SavedSafePlacesList } from "@/screens/events/SavedSafePlacesList";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// The "Zapisane" (Saved) screen: a 2-tab segmented control over the caller's
// saved events + saved safe places (reusing the same SegmentedControl as the
// Events tab). Defaults to the Events tab. Reached from the Bookmark button on
// the Events tab.

type Props = NativeStackScreenProps<EventsStackParamList, "Saved">;

const TAB_EVENTS = 0;
const TAB_SAFE_PLACES = 1;

const SEGMENTS = [strings.saved.tabEvents, strings.saved.tabSafePlaces];

export function SavedScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState(TAB_EVENTS);

  return (
    <View style={styles.root}>
      <View style={styles.segment}>
        <SegmentedControl
          segments={SEGMENTS}
          selectedIndex={tab}
          onChange={setTab}
        />
      </View>
      <View style={styles.body}>
        {tab === TAB_EVENTS && (
          <SavedEventsList
            onOpenEvent={(id) => navigation.navigate("EventDetail", { id })}
          />
        )}
        {tab === TAB_SAFE_PLACES && (
          <SavedSafePlacesList
            onOpenPlace={(id) => navigation.navigate("SafePlaceDetail", { id })}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    segment: {
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    body: { flex: 1 },
  });
}
