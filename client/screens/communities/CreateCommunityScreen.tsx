import { useMemo, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { TextField } from "@/components/forms/TextField";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { createCommunity } from "@/lib/api/communities";
import {
  validateCommunityName,
  validateCommunityDescription,
} from "@/validation/communities";
import {
  communityFieldErrorMessage,
  communityApiErrorMessage,
} from "@/lib/messages";
import { strings } from "@/i18n";
import { spacing } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Create-community form. Validates name/description against the (trimmed) client
// rules, then submits TRIMMED values so a whitespace-only name never reaches the
// API (the server schema doesn't trim — Codex refinement #1). On success it
// replaces this screen with the new community's detail.

type Props = NativeStackScreenProps<EventsStackParamList, "CreateCommunity">;

export function CreateCommunityScreen({ navigation }: Props) {
  const styles = useMemo(() => createStyles(), []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const nameErr = validateCommunityName(name);
    const descErr = validateCommunityDescription(description);
    setNameError(nameErr ? communityFieldErrorMessage(nameErr) : null);
    setDescriptionError(descErr ? communityFieldErrorMessage(descErr) : null);
    if (nameErr || descErr) return;

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    setSubmitting(true);
    setFormError(null);
    const res = await createCommunity({
      name: trimmedName,
      description: trimmedDescription || undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      navigation.replace("CommunityDetail", { id: res.data.id });
    } else {
      // Create cannot 409; pass a generic fallback for the conflict branch.
      setFormError(
        communityApiErrorMessage(res.error, strings.communities.createError),
      );
    }
  };

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <FormError message={formError} />
      <TextField
        label={strings.communities.nameLabel}
        value={name}
        onChangeText={setName}
        placeholder={strings.communities.namePlaceholder}
        error={nameError}
        autoCapitalize="sentences"
      />
      <TextField
        label={strings.communities.descriptionLabel}
        value={description}
        onChangeText={setDescription}
        placeholder={strings.communities.descriptionPlaceholder}
        error={descriptionError}
        autoCapitalize="sentences"
      />
      <PrimaryButton
        label={strings.communities.create}
        onPress={onSubmit}
        loading={submitting}
      />
    </ScrollView>
  );
}

function createStyles() {
  return StyleSheet.create({
    root: {
      flex: 1,
      // Transparent so the app-wide ScreenBackground shows through (see App.tsx).
      backgroundColor: "transparent",
    },
    content: {
      padding: spacing.lg,
    },
  });
}
