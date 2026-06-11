// Legal / consent constants. POLICY_VERSION is sent with every consent record
// (server caps it at 32 chars) and MUST match the published version of the
// Terms + Privacy Policy the user is agreeing to. Bump this whenever the policy
// text changes so consent_records reflect exactly what was shown (COMPLIANCE
// §5.1). Date-based versioning keeps it human-auditable.
export const POLICY_VERSION = "2026-06-10";

// Public legal documents shown/linked from the consent UI. Hosted on the web
// app; fill the real URLs at provisioning. Kept here so copy stays in one place.
const WEB_BASE = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "";

export const LEGAL_URLS = {
  terms: `${WEB_BASE}/regulamin`,
  privacy: `${WEB_BASE}/prywatnosc`,
} as const;

// True only when a real web base URL is configured, so the consent UI can show
// tappable links. Until then it shows an honest "available before launch" note
// rather than dead links to a relative path (GDPR: don't imply the referenced
// documents are accessible when they aren't).
export const LEGAL_LINKS_CONFIGURED = /^https?:\/\//.test(WEB_BASE);
