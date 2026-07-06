import { useMemo } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { EventCard } from "@/components/EventCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useSavedEvents } from "@/hooks/useSavedEvents";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// The "Wydarzenia" tab of the Saved screen: the caller's saved upcoming events
// (GET /events/saved), reusing EventCard. Refetch-on-focus via useSavedEvents.
// Tap a card → its detail screen (via onOpenEvent). Extracted so SavedScreen can
// host it beside SavedSafePlacesList under a 2-tab control.

type Props = { onOpenEvent: (id: string) => void };

export function SavedEventsList({ onOpenEvent }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { events, status, retry } = useSavedEvents();

  if (status === "loading" && events.length === 0) {
    return <CardListSkeleton variant="event" count={4} />;
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
        <EventCard event={item} onPress={(id) => onOpenEvent(id)} />
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
    root: { flex: 1, backgroundColor: "transparent" },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: { alignSelf: "stretch" },
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
    separator: { height: spacing.sm },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
  });
}
