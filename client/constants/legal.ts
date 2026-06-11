// Legal / consent constants. POLICY_VERSION is sent with every consent record
// (server caps it at 32 chars) and MUST match the published version of the
// Terms + Privacy Policy the user is agreeing to. Bump this whenever the policy
// text changes so consent_records reflect exactly what was shown (COMPLIANCE
// §5.1). Date-based versioning keeps it human-auditable.
export const POLICY_VERSION = "2026-06-10";

// Public legal documents shown/linked from the consent UI. Hosted on the web
// app; fill the real URLs at provisioning. Kept here so copy stays in one place.
export const LEGAL_URLS = {
  terms: `${process.env.EXPO_PUBLIC_WEB_APP_URL ?? ""}/regulamin`,
  privacy: `${process.env.EXPO_PUBLIC_WEB_APP_URL ?? ""}/prywatnosc`,
} as const;
