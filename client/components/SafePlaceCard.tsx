import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryChip } from "@/components/CategoryChip";
import { MapPin } from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, shadow, type ThemeColors } from "@/constants/theme";
import type { SafePlaceDTO } from "@shared/types";

// One venue in the Safe Places list (epic P-40 slice SP-3). A raised card:
// title + a category chip, then an address/city row with a pin icon. Display-
// only (a detail screen + directions are deferred). Coordinates are NEVER shown
// to the user — they exist only to place the venue on the map later (SP-4).

type Props = { place: SafePlaceDTO };

export function SafePlaceCard({ place }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const where = [place.address, place.city].filter(Boolean).join(", ");

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        <CategoryChip label={strings.safePlaces.categories[place.category]} />
      </View>
      {where ? (
        <View style={styles.row}>
          <MapPin size={15} color={colors.textMuted} />
          <Text style={styles.where} numberOfLines={1}>
            {where}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadow,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    name: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
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
  });
}
