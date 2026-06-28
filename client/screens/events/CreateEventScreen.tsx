import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { TextField } from "@/components/forms/TextField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
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
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Create-event form (entry: the member-only button on Community detail). Mirrors
// CreateCommunityScreen: validate (client mirror of the server schema) → submit
// trimmed → replace with the new event's detail on success. Dates use the native
// @react-native-community/datetimepicker (separate date + time, since Android
// can't do a combined "datetime" mode). startsAt defaults to the next top-of-hour;
// the end time is optional. Times are sent as ISO (UTC); the feed renders local.

type Props = NativeStackScreenProps<EventsStackParamList, "CreateEvent">;

type PickerTarget = { which: "start" | "end"; mode: "date" | "time" };

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

export function CreateEventScreen({ route, navigation }: Props) {
  const { communityId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState<Date>(nextTopOfHour);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = picker;
    setPicker(null); // Android dialogs are one-shot; close on every result.
    if (!target || event.type === "dismissed" || !selected) return;
    if (target.which === "start") {
      setStartsAt((s) => mergePart(s, selected, target.mode));
    } else {
      setEndsAt((e) => mergePart(e ?? startsAt, selected, target.mode));
    }
  };

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
    });
    setSubmitting(false);

    if (res.ok) {
      navigation.replace("EventDetail", { id: res.data.id });
    } else {
      setFormError(createEventApiErrorMessage(res.error));
    }
  };

  const pickerValue = picker?.which === "end" ? (endsAt ?? startsAt) : startsAt;

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <FormError message={formError} />

      <TextField
        label={strings.events.titleLabel}
        value={title}
        onChangeText={setTitle}
        placeholder={strings.events.titlePlaceholder}
        error={titleError}
        autoCapitalize="sentences"
      />
      <TextField
        label={strings.events.descriptionLabel}
        value={description}
        onChangeText={setDescription}
        placeholder={strings.events.descriptionPlaceholder}
        error={descriptionError}
        autoCapitalize="sentences"
      />
      <TextField
        label={strings.events.locationLabel}
        value={location}
        onChangeText={setLocation}
        placeholder={strings.events.locationPlaceholder}
        error={locationError}
        autoCapitalize="sentences"
      />

      {/* Start */}
      <Text style={styles.fieldLabel}>{strings.events.startLabel}</Text>
      <View style={styles.dateRow}>
        <Pressable
          testID="start-date"
          accessibilityRole="button"
          onPress={() => setPicker({ which: "start", mode: "date" })}
          style={styles.dateChip}
        >
          <Text style={styles.dateChipText}>{fmtDate(startsAt)}</Text>
        </Pressable>
        <Pressable
          testID="start-time"
          accessibilityRole="button"
          onPress={() => setPicker({ which: "start", mode: "time" })}
          style={styles.dateChip}
        >
          <Text style={styles.dateChipText}>{fmtTime(startsAt)}</Text>
        </Pressable>
      </View>

      {/* End (optional) */}
      {endsAt === null ? (
        <Pressable
          testID="add-end"
          accessibilityRole="button"
          onPress={() => setEndsAt(new Date(startsAt.getTime() + 60 * 60_000))}
          style={styles.addEnd}
        >
          <Text style={styles.addEndText}>{strings.events.addEnd}</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.fieldLabel}>{strings.events.endLabel}</Text>
          <View style={styles.dateRow}>
            <Pressable
              testID="end-date"
              accessibilityRole="button"
              onPress={() => setPicker({ which: "end", mode: "date" })}
              style={styles.dateChip}
            >
              <Text style={styles.dateChipText}>{fmtDate(endsAt)}</Text>
            </Pressable>
            <Pressable
              testID="end-time"
              accessibilityRole="button"
              onPress={() => setPicker({ which: "end", mode: "time" })}
              style={styles.dateChip}
            >
              <Text style={styles.dateChipText}>{fmtTime(endsAt)}</Text>
            </Pressable>
          </View>
          <Pressable
            testID="remove-end"
            accessibilityRole="button"
            onPress={() => {
              setEndsAt(null);
              setDateError(null);
            }}
          >
            <Text style={styles.removeEnd}>{strings.events.removeEnd}</Text>
          </Pressable>
        </>
      )}

      {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}

      {picker ? (
        <DateTimePicker
          testID="event-picker"
          value={pickerValue}
          mode={picker.mode}
          onChange={onPickerChange}
        />
      ) : null}

      <View style={styles.submit}>
        <PrimaryButton
          label={strings.events.create}
          onPress={onSubmit}
          loading={submitting}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    content: {
      padding: spacing.lg,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    dateRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    dateChip: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      alignItems: "center",
    },
    dateChipText: {
      color: colors.text,
      fontSize: 16,
    },
    addEnd: {
      marginTop: spacing.md,
    },
    addEndText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "600",
    },
    removeEnd: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.sm,
    },
    dateError: {
      color: colors.danger,
      fontSize: 13,
      marginTop: spacing.sm,
    },
    submit: {
      marginTop: spacing.xl,
    },
  });
}
