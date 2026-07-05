import { useMemo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { MapPin, Bookmark } from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
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
  // Tapping the card body opens the detail screen. The bookmark is a NESTED
  // Pressable, so its tap is captured there and doesn't also trigger onPress.
  onPress?: (place: SafePlaceDTO) => void;
};

export function SafePlaceCard({ place, onToggleSave, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const where = [place.address, place.city].filter(Boolean).join(", ");

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress ? () => onPress(place) : undefined}
      style={({ pressed }) => [
        styles.card,
        onPress && pressed && styles.cardPressed,
      ]}
    >
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
          <View style={styles.placeholderCircle}>
            <MapPin size={26} color={colors.primary} />
          </View>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        {/* Muted metadata line. Category only for now; a distance ("0.8 km ·")
            prepends here once "near me" ships with the map (SP-4). */}
        <Text style={styles.meta} numberOfLines={1}>
          {strings.safePlaces.categories[place.category]}
        </Text>
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
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadow,
      shadowOpacity: 0.06,
    },
    cardPressed: {
      opacity: 0.85,
    },
    thumb: {
      width: 84,
      height: 84,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    thumbPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    // A tinted brand-purple disc behind the pin — softer than a bare grey box.
    placeholderCircle: {
      width: 52,
      height: 52,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "1A", // ~10% brand tint
    },
    content: {
      flex: 1,
      gap: spacing.xs,
    },
    name: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    where: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 14,
    },
    saveBtn: {
      alignSelf: "flex-start",
      marginTop: -2,
      marginLeft: spacing.xs,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
