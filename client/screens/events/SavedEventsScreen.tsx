import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { EventCard } from "@/components/EventCard";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// The Saved-events list (reached from the Bookmark button on the Events tab).
// Shows the caller's saved upcoming events (GET /events/saved), reusing EventCard.
// Refetch-on-focus via useSavedEvents, so un-saving on the detail screen and
// returning here drops the row without a spinner. Tap a card → the detail screen.

type Props = NativeStackScreenProps<EventsStackParamList, "SavedEvents">;

export function SavedEventsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { events, status, retry } = useSavedEvents();

  if (status === "loading" && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" && events.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{strings.events.savedLoadError}</Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.events.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      testID="saved-events-list"
      style={styles.root}
      showsVerticalScrollIndicator={false}
      data={events}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <EventCard
          event={item}
          onPress={(id) => navigation.navigate("EventDetail", { id })}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>{strings.events.savedEmpty}</Text>
      }
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    separator: {
      height: spacing.sm,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
