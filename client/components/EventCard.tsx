import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryChip } from "@/components/CategoryChip";
import { formatEventDateBadge, formatEventTimeRange } from "@/lib/relativeTime";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventDTO } from "@shared/types";

// One event in the feed (design ref: events-screen.png): a date badge (weekday +
// day), the title, a "time · location" meta line, and the going COUNT as text.
// Attendee identities are deliberately never shown — the backend exposes the
// aggregate only, and showing who attends an Article 9 community's event could
// out someone. Tap → open the detail screen.

type Props = { event: EventDTO; onPress: (id: string) => void };

export function EventCard({ event, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const badge = formatEventDateBadge(event.startsAt);
  const time = formatEventTimeRange(event.startsAt, event.endsAt);
  const meta = [time, event.location].filter(Boolean).join("  ·  ");

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
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.going}>
            {format(strings.events.goingCount, { count: event.goingCount })}
          </Text>
          {event.category ? (
            <CategoryChip label={strings.events.categories[event.category]} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
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
    },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    meta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      gap: spacing.sm,
    },
    going: {
      color: colors.textMuted,
      fontSize: 13,
    },
  });
}
