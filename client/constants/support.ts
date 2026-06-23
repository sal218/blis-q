// Support / appeals contact. Filled at provisioning — the address is the client's
// (data controller's) decision, since they own the moderation/appeals policy.
// Until a real address is configured, the suspension screen shows honest static
// guidance rather than a dead mailto: (mirrors LEGAL_LINKS_CONFIGURED in
// ./legal.ts). The v1 appeal channel for P-20 is contact-by-email; the full
// in-app appeal flow is P-22.
const RAW_SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "";

export const SUPPORT_EMAIL = RAW_SUPPORT_EMAIL.trim();

// True only when a plausible email address is configured, so the suspension
// screen shows a tappable mailto: instead of an honest "contact us" fallback.
export const SUPPORT_EMAIL_CONFIGURED = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
  SUPPORT_EMAIL,
);
