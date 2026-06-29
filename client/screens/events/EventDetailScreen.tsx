import { useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { SegmentedControl } from "@/components/SegmentedControl";
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
import type { RsvpStatus } from "@shared/types";

// Event detail (design ref: assets/Event-Details*.png — light + dark). A banner
// (the event image, or a brand gradient placeholder) with a stacked date badge,
// then the title + icon rows (time / location / full date) + the About section,
// and a pinned bottom RSVP bar. The going count is AGGREGATE ONLY — attendee
// identities are never shown (Article 9). Banner UPLOAD (R2), Save, tags, and the
// cancelled/past states are deferred to later events-detail slices.

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

const BANNER_HEIGHT = 200;

// The date badge overlays the banner IMAGE (arbitrary colours), so its scrim +
// text are intentionally theme-INDEPENDENT: a dark scrim + white text stays
// legible over any image in BOTH light and dark mode (the standard photo-badge
// pattern). Theme tokens would wrongly flip these in dark mode.
const BADGE_SCRIM = "rgba(0,0,0,0.5)";
const BADGE_TEXT = "#fff";

// Segment order ↔ RsvpStatus. The caller's current status maps to a selected
// index; "no RSVP yet" is -1 (no segment highlighted).
const RSVP_ORDER: RsvpStatus[] = ["going", "interested", "not_going"];
const RSVP_LABELS = [
  strings.events.rsvpGoing,
  strings.events.rsvpInterested,
  strings.events.rsvpNotGoing,
];

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

  const selectedIndex = event.rsvp ? RSVP_ORDER.indexOf(event.rsvp.status) : -1;

  const onPickRsvp = async (index: number) => {
    if (submitting) return;
    const result = await setRsvp(RSVP_ORDER[index]);
    if (!result.ok) {
      Alert.alert(strings.events.rsvpError, result.message);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner + stacked date badge */}
        <View style={styles.banner}>
          {event.imageUrl ? (
            <Image
              testID="event-banner"
              source={{ uri: event.imageUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          ) : (
            <BannerPlaceholder colors={colors} />
          )}
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

      {/* Pinned RSVP bar (Save joins this bar in the Save slice). */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <Text style={styles.rsvpPrompt}>{strings.events.rsvpPrompt}</Text>
        <SegmentedControl
          segments={RSVP_LABELS}
          selectedIndex={selectedIndex}
          onChange={onPickRsvp}
        />
        {submitting ? (
          <ActivityIndicator
            style={styles.rsvpSpinner}
            color={colors.primary}
          />
        ) : null}
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
    banner: {
      height: BANNER_HEIGHT,
      width: "100%",
      backgroundColor: colors.surface,
    },
    bannerImage: {
      height: BANNER_HEIGHT,
      width: "100%",
    },
    badge: {
      position: "absolute",
      top: spacing.md,
      left: spacing.md,
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
    rsvpPrompt: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    rsvpSpinner: {
      marginTop: spacing.sm,
    },
  });
}
