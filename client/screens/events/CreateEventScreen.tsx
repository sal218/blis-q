import { useMemo, useState, type ReactNode } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TextField } from "@/components/forms/TextField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { CategoryChip } from "@/components/CategoryChip";
import {
  TextAa,
  NotePencil,
  MapPin,
  Faders,
  CalendarBlank,
} from "@/components/icons/PhosphorIcons";
import { createEvent } from "@/lib/api/events";
import {
  validateEventTitle,
  validateEventDescription,
  validateEventLocation,
  validateEventDates,
} from "@/validation/events";
import {
  eventFieldErrorMessage,
  createEventApiErrorMessage,
} from "@/lib/messages";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { EVENT_CATEGORIES, type EventCategory } from "@shared/types";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Create-event form (entry: the member-only button on Community detail; design
// ref: assets/events-page-details.jpeg). Each field is a card with an icon-badge
// header. Mirrors CreateCommunityScreen's flow: validate (client mirror of the
// server schema) → submit trimmed → replace with the new event's detail on
// success. Start has a separate date + time control and an optional end (Android
// has no combined "datetime" mode, so date/time are split on both platforms for
// symmetry). startsAt defaults to the next top-of-hour. Times are sent as ISO
// (UTC); the feed renders local. Category (slice D2) is an optional predefined
// tag from EVENT_CATEGORIES — never an identity label (Article 9).

type Props = NativeStackScreenProps<EventsStackParamList, "CreateEvent">;

type SectionIcon = (props: { size?: number; color?: string }) => ReactNode;

function nextTopOfHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Merge a picked date OR time into the base, leaving the other component intact.
function mergePart(base: Date, picked: Date, mode: "date" | "time"): Date {
  const d = new Date(base);
  if (mode === "date") {
    d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return d;
}

// A titled card with an icon badge header (design ref: events-page-details.jpeg).
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: SectionIcon;
  title: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Icon size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// One date OR time control. On iOS the native compact picker renders INLINE as
// the control itself (a pill that pops the calendar/wheel in place) — no separate
// button. On Android the picker has no inline UI, so we show a button and open it
// as a dialog on press. `onPick` receives the raw picked Date; the parent merges
// the relevant part. (testID is set on the picker on iOS and on the button on
// Android, so it's pressable in both real use and tests.)
function DateTimeChip({
  value,
  mode,
  onPick,
  testID,
}: {
  value: Date;
  mode: "date" | "time";
  onPick: (picked: Date) => void;
  testID: string;
}) {
  const { colors, mode: themeMode } = useTheme();
  const [open, setOpen] = useState(false);

  const handle = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setOpen(false); // Android dialogs are one-shot
    if (event.type === "dismissed" || !selected) return;
    onPick(selected);
  };

  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        testID={testID}
        value={value}
        mode={mode}
        display="compact"
        locale="pl-PL"
        themeVariant={themeMode === "dark" ? "dark" : "light"}
        accentColor={colors.primary}
        onChange={handle}
      />
    );
  }

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.text, fontSize: 16 }}>
          {mode === "date" ? fmtDate(value) : fmtTime(value)}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker value={value} mode={mode} onChange={handle} />
      ) : null}
    </>
  );
}

export function CreateEventScreen({ route, navigation }: Props) {
  const { communityId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState<Date>(nextTopOfHour);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  // Optional predefined category (slice D2). null = unset; tapping the selected
  // chip again clears it. The picker only offers valid EVENT_CATEGORIES, so the
  // server enum can't reject it.
  const [category, setCategory] = useState<EventCategory | null>(null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const titleErr = validateEventTitle(title);
    const descErr = validateEventDescription(description);
    const locErr = validateEventLocation(location);
    const dateErr = validateEventDates(startsAt, endsAt);
    setTitleError(titleErr ? eventFieldErrorMessage(titleErr) : null);
    setDescriptionError(descErr ? eventFieldErrorMessage(descErr) : null);
    setLocationError(locErr ? eventFieldErrorMessage(locErr) : null);
    setDateError(dateErr ? eventFieldErrorMessage(dateErr) : null);
    if (titleErr || descErr || locErr || dateErr) return;

    setSubmitting(true);
    setFormError(null);
    const res = await createEvent(communityId, {
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : undefined,
      category: category ?? undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      navigation.replace("EventDetail", { id: res.data.id });
    } else {
      setFormError(createEventApiErrorMessage(res.error));
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={strings.events.createTitle}
        onBack={navigation.goBack}
      />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>{strings.events.createSubtitle}</Text>
        <FormError message={formError} />

        <Section icon={TextAa} title={strings.events.titleLabel}>
          <TextField
            hideLabel
            label={strings.events.titleLabel}
            value={title}
            onChangeText={setTitle}
            placeholder={strings.events.titlePlaceholder}
            error={titleError}
            autoCapitalize="sentences"
          />
        </Section>

        <Section icon={NotePencil} title={strings.events.descriptionLabel}>
          <TextField
            hideLabel
            label={strings.events.descriptionLabel}
            value={description}
            onChangeText={setDescription}
            placeholder={strings.events.descriptionPlaceholder}
            error={descriptionError}
            autoCapitalize="sentences"
          />
        </Section>

        <Section icon={MapPin} title={strings.events.locationLabel}>
          <TextField
            hideLabel
            label={strings.events.locationLabel}
            value={location}
            onChangeText={setLocation}
            placeholder={strings.events.locationPlaceholder}
            error={locationError}
            autoCapitalize="sentences"
          />
        </Section>

        <Section icon={Faders} title={strings.events.categoryLabel}>
          <View style={styles.categoryWrap}>
            {EVENT_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={strings.events.categories[c]}
                category={c}
                selected={category === c}
                onPress={() => setCategory((cur) => (cur === c ? null : c))}
              />
            ))}
          </View>
        </Section>

        <Section icon={CalendarBlank} title={strings.events.startLabel}>
          <View style={styles.dateRow}>
            <DateTimeChip
              testID="start-date"
              value={startsAt}
              mode="date"
              onPick={(d) => setStartsAt((s) => mergePart(s, d, "date"))}
            />
            <DateTimeChip
              testID="start-time"
              value={startsAt}
              mode="time"
              onPick={(d) => setStartsAt((s) => mergePart(s, d, "time"))}
            />
          </View>

          {/* End (optional) */}
          {endsAt === null ? (
            <Pressable
              testID="add-end"
              accessibilityRole="button"
              onPress={() =>
                setEndsAt(new Date(startsAt.getTime() + 60 * 60_000))
              }
              style={({ pressed }) => [
                styles.endToggle,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.endToggleAdd}>
                ＋ {strings.events.addEnd}
              </Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.endLabel}>{strings.events.endLabel}</Text>
              <View style={styles.dateRow}>
                <DateTimeChip
                  testID="end-date"
                  value={endsAt}
                  mode="date"
                  onPick={(d) =>
                    setEndsAt((e) => mergePart(e ?? startsAt, d, "date"))
                  }
                />
                <DateTimeChip
                  testID="end-time"
                  value={endsAt}
                  mode="time"
                  onPick={(d) =>
                    setEndsAt((e) => mergePart(e ?? startsAt, d, "time"))
                  }
                />
              </View>
              <Pressable
                testID="remove-end"
                accessibilityRole="button"
                onPress={() => {
                  setEndsAt(null);
                  setDateError(null);
                }}
                style={({ pressed }) => [
                  styles.endToggle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.endToggleRemove}>
                  ✕ {strings.events.removeEnd}
                </Text>
              </Pressable>
            </>
          )}

          {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}
        </Section>

        <View style={styles.submit}>
          <PrimaryButton
            label={strings.events.create}
            onPress={onSubmit}
            loading={submitting}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      marginBottom: spacing.lg,
    },
    // A raised card per field (design ref). background-coloured so the surface-
    // coloured inputs inside it read against it; border + soft shadow lift it.
    section: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadow,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sectionIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.primary + "18", // ~9% brand tint (light + dark)
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    categoryWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    endLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    // Add/remove end time: a clearly-tappable bordered pill (not bare text).
    endToggle: {
      alignSelf: "flex-start",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: spacing.md,
    },
    pressed: {
      opacity: 0.6,
    },
    endToggleAdd: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    endToggleRemove: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
    },
    dateError: {
      color: colors.danger,
      fontSize: 13,
      marginTop: spacing.sm,
    },
    submit: {
      marginTop: spacing.sm,
    },
  });
}
