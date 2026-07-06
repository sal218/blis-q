import { useMemo } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { SafePlaceCard } from "@/components/SafePlaceCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useSavedSafePlaces } from "@/hooks/useSavedSafePlaces";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// The "Bezpieczne miejsca" tab of the Saved screen: the caller's saved places
// (GET /safe-places/saved), reusing SafePlaceCard. Refetch-on-focus via
// useSavedSafePlaces. Every row is saved, so the card's bookmark unsaves and
// optimistically removes the row. No detail nav (no safe-place detail screen).

type Props = { onOpenPlace?: (id: string) => void };

export function SavedSafePlacesList({ onOpenPlace }: Props = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { places, status, toggleSave, retry } = useSavedSafePlaces();

  if (status === "loading" && places.length === 0) {
    return <CardListSkeleton count={4} />;
  }

  if (status === "error" && places.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {strings.safePlaces.savedLoadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.safePlaces.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      testID="saved-safe-places-list"
      style={styles.root}
      showsVerticalScrollIndicator={false}
      data={places}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <SafePlaceCard
          place={item}
          onToggleSave={toggleSave}
          onPress={onOpenPlace ? (p) => onOpenPlace(p.id) : undefined}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>{strings.safePlaces.savedEmpty}</Text>
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
