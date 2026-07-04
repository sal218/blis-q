import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryChip } from "@/components/CategoryChip";
import { Clock, MapPin, Bookmark } from "@/components/icons/PhosphorIcons";
import { formatEventDateBadge, formatEventTimeRange } from "@/lib/relativeTime";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventDTO } from "@shared/types";

// One event in the feed (design ref: events-screen.png): a date badge (weekday +
// day) on the left, then a stacked body — title, time row, location row, the
// going COUNT, and the category tag — with a save/bookmark button in the top
// corner. Attendee identities are deliberately never shown (the backend exposes
// the aggregate only; showing who attends an Article 9 community's event could
// out someone). Tap the card → open detail; tap the bookmark → toggle saved.
// `onToggleSave` is optional: the feed passes it (interactive bookmark); the Home
// rail / saved list omit it (no bookmark shown).

type Props = {
  event: EventDTO;
  onPress: (id: string) => void;
  onToggleSave?: (event: EventDTO) => void;
};

export function EventCard({ event, onPress, onToggleSave }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const badge = formatEventDateBadge(event.startsAt);
  const time = formatEventTimeRange(event.startsAt, event.endsAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeWeekday}>{badge.weekday}</Text>
        <Text style={styles.badgeDay}>{badge.day}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.row}>
          <Clock size={14} color={colors.textMuted} />
          <Text style={styles.rowText} numberOfLines={1}>
            {time}
          </Text>
        </View>

        {event.location ? (
          <View style={styles.row}>
            <MapPin size={14} color={colors.textMuted} />
            <Text style={styles.rowText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}

        <Text style={styles.going}>
          {format(strings.events.goingCount, { count: event.goingCount })}
        </Text>

        {event.category ? (
          <View style={styles.tagRow}>
            <CategoryChip
              label={strings.events.categories[event.category]}
              category={event.category}
            />
          </View>
        ) : null}
      </View>

      {onToggleSave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            event.saved ? strings.events.savedAction : strings.events.saveAction
          }
          accessibilityState={{ selected: event.saved }}
          hitSlop={10}
          onPress={() => onToggleSave(event)}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
        >
          <Bookmark
            size={22}
            filled={event.saved}
            color={event.saved ? colors.primary : colors.textMuted}
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
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    cardPressed: {
      opacity: 0.7,
    },
    badge: {
      width: 52,
      alignItems: "center",
      marginRight: spacing.md,
    },
    badgeWeekday: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    badgeDay: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      lineHeight: 30,
    },
    body: {
      flex: 1,
      // Keep text clear of the top-right bookmark.
      paddingRight: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: 2,
    },
    rowText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 13,
    },
    going: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: spacing.xs,
    },
    tagRow: {
      flexDirection: "row",
      marginTop: spacing.sm,
    },
    saveBtn: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
      padding: spacing.xs,
    },
    pressed: {
      opacity: 0.5,
    },
  });
}
