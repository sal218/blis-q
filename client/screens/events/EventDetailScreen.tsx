import { useMemo, useState } from "react";
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
import { ReportPostModal } from "@/components/ReportPostModal";
import {
  Clock,
  MapPin,
  CalendarBlank,
  CaretLeft,
} from "@/components/icons/PhosphorIcons";
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
// shown (Article 9). Cancelled/past events show a notice + a closed RSVP bar,
// and the creator can cancel from the ⋯ sheet (slice B2). Banner UPLOAD (R2),
// Save, and tags are deferred to later events-detail slices.

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

export function EventDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    event,
    status,
    errorMessage,
    submitting,
    retry,
    setRsvp,
    report,
    cancel,
  } = useEvent(route.params.id);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // The native header is hidden (full-bleed banner), so the screen owns its back
  // button — a floating circle that reads over the banner or a plain screen.
  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.common.back}
      hitSlop={8}
      onPress={() => navigation.goBack()}
      style={[styles.backBtn, { top: insets.top + spacing.sm }]}
    >
      <CaretLeft size={22} color="#fff" />
    </Pressable>
  );

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !event) {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
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
  // A cancelled or past event is closed to RSVP (the server rejects it too).
  const isCancelled = event.status === "cancelled";
  const rsvpClosed = isCancelled || event.past;

  const onToggleGoing = async () => {
    if (submitting) return;
    const result = await setRsvp(isGoing ? "not_going" : "going");
    if (!result.ok) {
      Alert.alert(strings.events.rsvpError, result.message);
    }
  };

  // Creator cancels the event — confirm first (mirrors the post-delete flow),
  // then call cancel(); a failure surfaces the mapped message.
  const onCancelEvent = () => {
    setMenuVisible(false);
    Alert.alert(
      strings.events.cancelConfirmTitle,
      strings.events.cancelConfirmBody,
      [
        { text: strings.common.cancel, style: "cancel" },
        {
          text: strings.events.cancelAction,
          style: "destructive",
          onPress: async () => {
            const result = await cancel();
            if (!result.ok)
              Alert.alert(strings.events.cancelError, result.message);
          },
        },
      ],
    );
  };

  // ReportPostModal closes itself on success / shows the mapped error otherwise;
  // we add a brief success confirmation.
  const onSubmitReport = async (reason: string) => {
    const result = await report(reason);
    if (result.ok) Alert.alert(strings.posts.reportSuccess);
    return result;
  };

  // ⋯ overflow (top-right), mirroring the floating back button. Opens an action
  // sheet — Cancel (creator only, via canCancel) + Report; share/edit land later.
  const moreButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.events.moreActions}
      hitSlop={8}
      onPress={() => setMenuVisible(true)}
      style={[styles.moreBtn, { top: insets.top + spacing.sm }]}
    >
      <Text style={styles.moreGlyph}>⋯</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      {backButton}
      {moreButton}
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

          {isCancelled ? (
            <View style={[styles.notice, styles.noticeCancelled]}>
              <Text style={styles.noticeCancelledText}>
                {strings.events.cancelledNotice}
              </Text>
            </View>
          ) : event.past ? (
            <View style={[styles.notice, styles.noticePast]}>
              <Text style={styles.noticePastText}>
                {strings.events.pastNotice}
              </Text>
            </View>
          ) : null}

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

      {/* Pinned action bar: the "Pójdę" (going) toggle when the event is open;
          a disabled labelled pill when cancelled/past (RSVP is closed — the
          server rejects it too). The Save button joins here in slice C. */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        {rsvpClosed ? (
          <View style={styles.closedBtn}>
            <Text style={styles.closedBtnText} numberOfLines={1}>
              {isCancelled
                ? strings.events.rsvpClosedCancelled
                : strings.events.rsvpClosedPast}
            </Text>
          </View>
        ) : (
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
        )}
      </View>

      {/* ⋯ action sheet — an absolute overlay (NOT a Modal) so opening the
          report Modal right after doesn't hit the iOS modal-over-modal bug. */}
      {menuVisible ? (
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md },
            ]}
            onPress={() => {}}
          >
            {event.canCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.events.cancelAction}
                onPress={onCancelEvent}
                style={styles.sheetRow}
              >
                <Text style={styles.sheetRowText}>
                  {strings.events.cancelAction}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.events.reportEvent}
              onPress={() => {
                setMenuVisible(false);
                setReportVisible(true);
              }}
              style={styles.sheetRow}
            >
              <Text style={styles.sheetRowText}>
                {strings.events.reportEvent}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.common.cancel}
              onPress={() => setMenuVisible(false)}
              style={styles.sheetRow}
            >
              <Text style={styles.sheetCancelText}>
                {strings.common.cancel}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}

      <ReportPostModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={onSubmitReport}
        title={strings.events.reportTitle}
        placeholder={strings.events.reportPlaceholder}
      />
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
    backBtn: {
      position: "absolute",
      left: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      // Translucent dark circle (like the date badge scrim) so the chevron reads
      // over any banner image AND over a plain loading/error screen.
      backgroundColor: BADGE_SCRIM,
    },
    moreBtn: {
      position: "absolute",
      right: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: BADGE_SCRIM,
    },
    moreGlyph: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 22,
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    sheetRow: {
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    sheetRowText: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: "700",
    },
    sheetCancelText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "600",
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
    notice: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
    },
    noticeCancelled: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
    },
    noticeCancelledText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700",
    },
    noticePast: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    noticePastText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "600",
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
    closedBtn: {
      alignItems: "center",
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    closedBtnText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "800",
    },
  });
}
