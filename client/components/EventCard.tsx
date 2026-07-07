import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { CategoryChip } from "@/components/CategoryChip";
import {
  Clock,
  MapPin,
  UsersThree,
  Bookmark,
} from "@/components/icons/PhosphorIcons";
import { formatEventDateBadge, formatEventTimeRange } from "@/lib/relativeTime";
import { strings, goingLabel } from "@/i18n";
import { spacing, shadow, type ThemeColors } from "@/constants/theme";
import type { EventDTO } from "@shared/types";

// One event in the feed (design ref: assets/events-screen.png — premium light +
// dark). A raised white/soft-glass card: a vertically-centred date column
// (weekday · day · month-year) + a hairline divider + a content column (title,
// then time / location / attendee-count metadata rows, then a divider + the
// category tag), with a save/bookmark in the top-right. Attendee identities are
// deliberately never shown — the backend exposes the aggregate COUNT only;
// showing who attends an Article 9 community's event could out someone. Tap the
// card → open detail; tap the bookmark → toggle saved. `onToggleSave` is
// optional: the feed passes it (interactive bookmark); the Home rail / saved list
// omit it (no bookmark). Every card renders the same rows (location always shown,
// a fixed-height tag slot) so all feed cards are a uniform height.

type Props = {
  event: EventDTO;
  onPress: (id: string) => void;
  onToggleSave?: (event: EventDTO) => void;
};

export function EventCard({ event, onPress, onToggleSave }: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDark = mode === "dark";

  const badge = formatEventDateBadge(event.startsAt);
  const year = new Date(event.startsAt).getFullYear();
  const time = formatEventTimeRange(event.startsAt, event.endsAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [
        styles.card,
        isDark && styles.cardDark,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.dateCol}>
        <Text style={styles.weekday}>{badge.weekday}</Text>
        <Text style={styles.day}>{badge.day}</Text>
        <Text style={styles.monthYear}>
          {badge.month} {year}
        </Text>
      </View>

      <View style={styles.vDivider} />

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>

        <View style={styles.row}>
          <Clock size={15} color={colors.textMuted} />
          <Text style={styles.rowText} numberOfLines={1}>
            {time}
          </Text>
        </View>

        <View style={styles.row}>
          <MapPin size={15} color={colors.textMuted} />
          <Text style={styles.rowText} numberOfLines={1}>
            {event.location ?? strings.events.noLocation}
          </Text>
        </View>

        <View style={styles.row}>
          <UsersThree size={15} color={colors.textMuted} />
          <Text style={styles.rowText} numberOfLines={1}>
            {goingLabel(event.goingCount)}
          </Text>
        </View>

        {/* Fixed-height tag slot keeps every card the same height whether or not
            it has a category. When present: a hairline divider + the tag pill,
            flush with the title's left edge. */}
        <View style={styles.tagSlot}>
          {event.category ? (
            <>
              <View style={styles.hDivider} />
              <CategoryChip
                label={strings.events.categories[event.category]}
                category={event.category}
              />
            </>
          ) : null}
        </View>
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
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md + 2,
      ...shadow,
    },
    // Dark mode: a translucent "glass" surface on the deep-purple page, with a
    // soft lavender edge + an inner top highlight (light reflecting on glass) and
    // a softer, deeper shadow. Light mode keeps the clean white card above.
    cardDark: {
      backgroundColor: "rgba(30,25,70,0.55)",
      borderColor: "rgba(255,255,255,0.14)",
      borderTopColor: "rgba(255,255,255,0.22)",
      shadowColor: "#000000",
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    cardPressed: {
      opacity: 0.85,
    },
    // Centred vertically so the date sits balanced against the content column.
    dateCol: {
      width: 60,
      alignItems: "center",
      justifyContent: "center",
    },
    weekday: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    day: {
      color: colors.text,
      fontSize: 34,
      fontWeight: "800",
      lineHeight: 38,
    },
    monthYear: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 2,
    },
    vDivider: {
      width: 1,
      alignSelf: "stretch",
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    content: {
      flex: 1,
      // Keep text clear of the top-right bookmark.
      paddingRight: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: 3,
    },
    rowText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 14,
    },
    tagSlot: {
      minHeight: 44,
      justifyContent: "center",
    },
    hDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginTop: spacing.sm,
      marginBottom: spacing.sm + 2,
    },
    saveBtn: {
      position: "absolute",
      top: spacing.md,
      right: spacing.md,
      padding: spacing.xs,
    },
    pressed: {
      opacity: 0.5,
    },
  });
}
