import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { SegmentedControl } from "@/components/SegmentedControl";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { useEvent } from "@/hooks/useEvent";
import { formatEventDateBadge, formatEventTimeRange } from "@/lib/relativeTime";
import { strings, format } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";
import type { RsvpStatus } from "@shared/types";

// Event detail (reached from the feed): title, when/where, description, going
// count (aggregate only — no attendee list), and an RSVP control. Pressing a
// status upserts the caller's RSVP and patches goingCount in place. Report +
// edit/delete are deferred to the next slice.

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

// Segment order ↔ RsvpStatus. The caller's current status maps to a selected
// index; "no RSVP yet" is -1 (no segment highlighted).
const RSVP_ORDER: RsvpStatus[] = ["going", "interested", "not_going"];
const RSVP_LABELS = [
  strings.events.rsvpGoing,
  strings.events.rsvpInterested,
  strings.events.rsvpNotGoing,
];

export function EventDetailScreen({ route }: Props) {
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
  const when = [badge.weekday, badge.day].filter(Boolean).join(" ");
  const whenLine = [when, time].filter(Boolean).join("  ·  ");

  const selectedIndex = event.rsvp ? RSVP_ORDER.indexOf(event.rsvp.status) : -1;

  const onPickRsvp = async (index: number) => {
    if (submitting) return;
    const next = RSVP_ORDER[index];
    const result = await setRsvp(next);
    if (!result.ok) {
      Alert.alert(strings.events.rsvpError, result.message);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{event.title}</Text>

      <Text style={styles.sectionLabel}>{strings.events.whenLabel}</Text>
      <Text style={styles.value}>{whenLine}</Text>

      <Text style={styles.sectionLabel}>{strings.events.whereLabel}</Text>
      <Text style={styles.value}>
        {event.location ?? strings.events.noLocation}
      </Text>

      <Text style={styles.sectionLabel}>{strings.events.aboutLabel}</Text>
      <Text style={styles.value}>
        {event.description ?? strings.events.noDescription}
      </Text>

      <Text style={styles.going}>
        {format(strings.events.goingCount, { count: event.goingCount })}
      </Text>

      <Text style={styles.rsvpPrompt}>{strings.events.rsvpPrompt}</Text>
      <SegmentedControl
        segments={RSVP_LABELS}
        selectedIndex={selectedIndex}
        onChange={onPickRsvp}
      />
      {submitting ? (
        <ActivityIndicator style={styles.rsvpSpinner} color={colors.primary} />
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
    },
    content: {
      padding: spacing.lg,
    },
    centered: {
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
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      marginBottom: spacing.md,
    },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: spacing.md,
    },
    value: {
      color: colors.text,
      fontSize: 16,
      marginTop: spacing.xs,
    },
    going: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.lg,
    },
    rsvpPrompt: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    rsvpSpinner: {
      marginTop: spacing.md,
    },
  });
}
