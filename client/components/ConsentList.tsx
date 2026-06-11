import { View } from "react-native";
import type { ConsentType } from "@shared/types";
import { ConsentCheckbox } from "@/components/forms/ConsentCheckbox";
import { strings } from "@/i18n";

// The four consent purposes (COMPLIANCE §5.1). account_creation is required —
// the lawful basis for the account itself (Article 9(2)(a)); the rest are
// optional. The parent owns the selection (useConsent) and the submit gate.

const ITEMS: { type: ConsentType; label: string; required?: boolean }[] = [
  {
    type: "account_creation",
    label: strings.consent.accountCreation,
    required: true,
  },
  { type: "marketing_emails", label: strings.consent.marketing },
  { type: "analytics", label: strings.consent.analytics },
  { type: "location_data", label: strings.consent.location },
];

type Props = {
  selected: readonly ConsentType[];
  onToggle: (type: ConsentType) => void;
};

export function ConsentList({ selected, onToggle }: Props) {
  return (
    <View>
      {ITEMS.map((item) => (
        <ConsentCheckbox
          key={item.type}
          label={item.label}
          required={item.required}
          checked={selected.includes(item.type)}
          onToggle={() => onToggle(item.type)}
        />
      ))}
    </View>
  );
}
