import { useMemo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryChip } from "@/components/CategoryChip";
import { MapPin, Bookmark } from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, shadow, type ThemeColors } from "@/constants/theme";
import type { SafePlaceDTO } from "@shared/types";

// One venue in the Safe Places list (epic P-40, per assets/safe-places-with-map).
// A raised card: a square venue photo on the left (a branded placeholder when
// there's none), then the name, a category chip and an address/city row, with an
// optional bookmark toggle at the top-right. Display-only otherwise (a detail
// screen + directions are deferred). Coordinates are NEVER shown to the user —
// they exist only to place the venue on the map later (SP-4). `imageUrl` is a
// short-lived signed URL from the API; `onToggleSave` is optional (passed where
// the bookmark is interactive, omitted for a purely display-only card).

type Props = {
  place: SafePlaceDTO;
  onToggleSave?: (place: SafePlaceDTO) => void;
};

export function SafePlaceCard({ place, onToggleSave }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const where = [place.address, place.city].filter(Boolean).join(", ");

  return (
    <View style={styles.card}>
      {place.imageUrl ? (
        <Image
          testID="safe-place-thumb"
          source={{ uri: place.imageUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View
          testID="safe-place-thumb-placeholder"
          style={[styles.thumb, styles.thumbPlaceholder]}
        >
          <MapPin size={26} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        <View style={styles.chipRow}>
          <CategoryChip label={strings.safePlaces.categories[place.category]} />
        </View>
        {where ? (
          <View style={styles.row}>
            <MapPin size={14} color={colors.textMuted} />
            <Text style={styles.where} numberOfLines={1}>
              {where}
            </Text>
          </View>
        ) : null}
      </View>

      {onToggleSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            place.saved
              ? strings.safePlaces.savedAction
              : strings.safePlaces.saveAction
          }
          accessibilityState={{ selected: place.saved }}
          hitSlop={10}
          onPress={() => onToggleSave(place)}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
        >
          <Bookmark
            size={22}
            filled={place.saved}
            color={place.saved ? colors.primary : colors.textMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadow,
    },
    thumb: {
      width: 68,
      height: 68,
      borderRadius: 14,
      backgroundColor: colors.surface,
    },
    thumbPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    chipRow: {
      flexDirection: "row",
      marginTop: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    where: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 14,
    },
    saveBtn: {
      marginTop: -2,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
