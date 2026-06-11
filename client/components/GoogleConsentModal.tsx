import { Modal, View, Text, StyleSheet } from "react-native";
import { useConsent } from "@/hooks/useConsent";
import { ConsentList } from "@/components/ConsentList";
import { LegalLinks } from "@/components/LegalLinks";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { TextLink } from "@/components/forms/TextLink";
import { FormError } from "@/components/forms/FormError";
import type { GoogleConsent } from "@/lib/googleFlow";
import { POLICY_VERSION } from "@/constants/legal";
import { strings } from "@/i18n";
import { colors, spacing, radius } from "@/constants/theme";

// Shown when a first-time Google user must give consent before the account is
// created (backend returned consent_required). Collects the same consent set as
// signup and hands it back; the screen's hook reuses the in-memory Google
// credential to retry. A Modal animation is fine here (this is NOT the
// quick-exit safety surface, which must never animate).

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (consent: GoogleConsent) => void;
  onCancel: () => void;
};

export function GoogleConsentModal({
  visible,
  loading,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const { selected, toggle, isValid } = useConsent();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{strings.consent.googleTitle}</Text>
          <Text style={styles.intro}>{strings.consent.googleIntro}</Text>

          <ConsentList selected={selected} onToggle={toggle} />
          <LegalLinks />

          <FormError message={error} />

          <PrimaryButton
            label={strings.consent.confirm}
            onPress={() => onSubmit({ consentedTypes: selected, policyVersion: POLICY_VERSION })}
            loading={loading}
            disabled={!isValid}
          />
          <TextLink label={strings.common.cancel} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  intro: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
});
