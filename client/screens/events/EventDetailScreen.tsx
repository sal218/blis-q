import { useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { Clock, MapPin, CalendarBlank } from "@/components/icons/PhosphorIcons";
import { useEvent } from "@/hooks/useEvent";
import {
  formatEventDateBadge,
  formatEventDateLong,
  formatEventTimeRange,
} from "@/lib/relativeTime";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Event detail (design ref: assets/Event-Details*.png — light + dark). An
// edge-to-edge banner (the event image, or a brand gradient placeholder) with
// rounded bottom corners and a stacked date badge at its bottom-left, then the
// title + icon rows (time / location / full date) + About, and a pinned bottom
// RSVP bar. The going count is AGGREGATE ONLY — attendee identities are never
// shown (Article 9). Banner UPLOAD (R2), Save, tags, and cancelled/past states
// are deferred to later events-detail slices.

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

const BANNER_HEIGHT = 240;
const BANNER_RADIUS = 28;

// The date badge overlays the banner IMAGE (arbitrary colours), so its scrim +
// text are intentionally theme-INDEPENDENT: a dark scrim + white text stays
// legible over any image in BOTH light and dark mode (the standard photo-badge
// pattern). Theme tokens would wrongly flip these in dark mode.
const BADGE_SCRIM = "rgba(0,0,0,0.5)";
const BADGE_TEXT = "#fff";

// Brand gradient shown when the event has no banner image.
function BannerPlaceholder({ colors }: { colors: ThemeColors }) {
  return (
    <Svg testID="event-banner-placeholder" width="100%" height={BANNER_HEIGHT}>
      <Defs>
        <LinearGradient id="event-banner" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.primary} />
          <Stop offset="1" stopColor={colors.accent} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={BANNER_HEIGHT} fill="url(#event-banner)" />
    </Svg>
  );
}

export function EventDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { event, status, errorMessage, submitting, retry, setRsvp } = useEvent(
    route.params.id,
  );

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !event) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.errorText}>
          {errorMessage ?? strings.events.detailLoadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.events.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  const badge = formatEventDateBadge(event.startsAt);
  const time = formatEventTimeRange(event.startsAt, event.endsAt);
  // The Clock row above already shows the time; this row is the full date only.
  const fullWhen = formatEventDateLong(event.startsAt);

  // Binary "going" toggle (the client mockup's "I'm going" model). Tap to mark
  // going; tap again to clear it (→ not_going). Save joins this bar in the Save
  // slice (C); Interested isn't in the client design.
  const isGoing = event.rsvp?.status === "going";

  const onToggleGoing = async () => {
    if (submitting) return;
    const result = await setRsvp(isGoing ? "not_going" : "going");
    if (!result.ok) {
      Alert.alert(strings.events.rsvpError, result.message);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        // Don't auto-inset below the status bar — let the banner run fully
        // edge-to-edge to the top edge (immersive, under the status bar).
        contentInsetAdjustmentBehavior="never"
      >
        {/* Edge-to-edge banner with rounded bottom + bottom-left date badge */}
        <View style={styles.bannerWrap}>
          <View style={styles.bannerClip}>
            {event.imageUrl ? (
              <Image
                testID="event-banner"
                source={{ uri: event.imageUrl }}
                style={styles.bannerMedia}
                resizeMode="cover"
              />
            ) : (
              <BannerPlaceholder colors={colors} />
            )}
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeWeekday}>{badge.weekday}</Text>
            <Text style={styles.badgeDay}>{badge.day}</Text>
            <Text style={styles.badgeMonth}>{badge.month}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{event.title}</Text>

          {time ? (
            <View style={styles.row}>
              <Clock size={18} color={colors.textMuted} />
              <Text style={styles.rowText}>{time}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <MapPin size={18} color={colors.textMuted} />
            <Text style={styles.rowText}>
              {event.location ?? strings.events.noLocation}
            </Text>
          </View>

          <Text style={styles.going}>
            {format(strings.events.goingCount, { count: event.goingCount })}
          </Text>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>{strings.events.aboutLabel}</Text>
          <Text style={styles.description}>
            {event.description ?? strings.events.noDescription}
          </Text>

          {fullWhen ? (
            <View style={[styles.row, styles.fullDateRow]}>
              <CalendarBlank size={18} color={colors.textMuted} />
              <Text style={styles.rowText}>{fullWhen}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned action bar: the "Pójdę" (going) toggle. The Save button joins
          it here in the Save slice (C) → the mockup's two-button bar. */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.events.rsvpGoing}
          accessibilityState={{ selected: isGoing }}
          disabled={submitting}
          onPress={onToggleGoing}
          style={({ pressed }) => [
            styles.goBtn,
            isGoing && styles.goBtnActive,
            pressed && styles.goBtnPressed,
          ]}
        >
          <Text
            style={[styles.goBtnText, isGoing && styles.goBtnTextActive]}
            numberOfLines={1}
          >
            {isGoing
              ? `✓ ${strings.events.rsvpGoing}`
              : strings.events.rsvpGoing}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
    },
    scrollContent: {
      paddingBottom: spacing.xl,
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
    bannerWrap: {
      width: "100%",
      height: BANNER_HEIGHT,
    },
    bannerClip: {
      width: "100%",
      height: BANNER_HEIGHT,
      overflow: "hidden",
      borderBottomLeftRadius: BANNER_RADIUS,
      borderBottomRightRadius: BANNER_RADIUS,
      backgroundColor: colors.surface,
    },
    bannerMedia: {
      width: "100%",
      height: BANNER_HEIGHT,
    },
    badge: {
      position: "absolute",
      bottom: spacing.md,
      left: spacing.lg,
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: BADGE_SCRIM,
    },
    badgeWeekday: {
      color: BADGE_TEXT,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    badgeDay: {
      color: BADGE_TEXT,
      fontSize: 26,
      fontWeight: "800",
      lineHeight: 30,
    },
    badgeMonth: {
      color: BADGE_TEXT,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    body: {
      padding: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    rowText: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
    },
    going: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.md,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.lg,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    description: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    fullDateRow: {
      marginTop: spacing.lg,
    },
    bottomBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    goBtn: {
      alignItems: "center",
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    goBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    goBtnPressed: {
      opacity: 0.85,
    },
    goBtnText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "800",
    },
    goBtnTextActive: {
      color: "#fff",
    },
  });
}
