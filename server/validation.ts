import { z } from "zod";

// Zod schemas for the backend request boundary. Every mutation route validates
// its body against one of these before doing anything else (CLAUDE.md §6,
// ENGINEERING_STANDARDS). See docs/API.md for the locked contract.
//
// Convention: request BODY schemas are `.strict()` — unknown/extra keys are
// rejected (not silently stripped), matching docs/API.md. Query schemas are
// intentionally lenient (extra query params like filters are ignored, not
// rejected). Path-scoped IDs (e.g. communityId in /communities/:id/...) come
// from req.params and are NOT duplicated in body schemas.

// Field limits — kept local to this file (ENGINEERING_STANDARDS §8). Promote to
// shared/constants.ts only if the client needs the same values.
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_COMMUNITY_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_POST_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_EVENT_TITLE_LENGTH = 150;
const MAX_REPORT_REASON_LENGTH = 1000;
const MAX_POLICY_VERSION_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 8;

// Consent purposes recorded in consent_records (COMPLIANCE §5.1).
export const consentTypeSchema = z.enum([
  "account_creation",
  "marketing_emails",
  "analytics",
  "location_data",
]);

// Registration requires explicit consent. The consented set MUST include
// `account_creation` — that's the lawful basis for the account itself (Article
// 9(2)(a) explicit consent, COMPLIANCE §5.1). Enforced in the schema, not only
// in route logic, so `["analytics"]` alone can never create an account.
// email is lowercased at the boundary so DB uniqueness, rate-limit buckets, and
// Supabase all see one canonical form. displayName is trimmed (no whitespace-
// only names). consentedTypes are deduped so duplicates can't create duplicate
// consent_records.
export const registerSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase(),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
    consentedTypes: z
      .array(consentTypeSchema)
      .min(1)
      .refine((types) => types.includes("account_creation"), {
        message: "account_creation consent is required",
      })
      .transform((types) => [...new Set(types)]),
    policyVersion: z.string().min(1).max(MAX_POLICY_VERSION_LENGTH),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase(),
    password: z.string().min(1).max(128),
  })
  .strict();

// Google Sign-In (docs/API.md §4). The mobile app obtains a Google OIDC ID
// token and posts it here; the backend exchanges it for a Supabase session via
// signInWithIdToken (Option A — Supabase owns Supabase sessions). `accessToken`
// and `nonce` are optional pass-throughs: some native Google flows must send the
// access token alongside the ID token, and nonce-bound flows (mobile generates
// the nonce) require it for verification. On FIRST sign-up there is no local
// account yet, so consent must be supplied exactly as in registerSchema — the
// route returns `consent_required` (422) when it is absent and the mobile app
// then re-submits with consent. consentedTypes/policyVersion are optional here
// (a returning user needs neither); the refine still enforces account_creation
// whenever consentedTypes IS present, so a partial consent set can never slip
// through.
export const googleSignInSchema = z
  .object({
    idToken: z.string().min(1),
    accessToken: z.string().min(1).optional(),
    nonce: z.string().min(1).optional(),
    consentedTypes: z
      .array(consentTypeSchema)
      .min(1)
      .refine((types) => types.includes("account_creation"), {
        message: "account_creation consent is required",
      })
      .transform((types) => [...new Set(types)])
      .optional(),
    policyVersion: z.string().min(1).max(MAX_POLICY_VERSION_LENGTH).optional(),
  })
  .strict();

export const passwordResetRequestSchema = z
  .object({ email: z.string().email().max(254).toLowerCase() })
  .strict();

export const resendVerificationSchema = z
  .object({ email: z.string().email().max(254).toLowerCase() })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  })
  .strict();

export const withdrawConsentSchema = z
  .object({ consentType: consentTypeSchema })
  .strict();

// ── Profile / uploads ─────────────────────────────────────────────────────────

// 🚧 preferredCity is city-level TEXT only — no GPS coordinates (COMPLIANCE §5.8).
// avatarKey is intentionally NOT accepted yet: avatar upload needs R2, which is
// not provisioned. It will be added back (with the presigned-upload flow) when
// R2 lands. An empty body is rejected — PATCH must change something.
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
    preferredCity: z.string().trim().max(100).optional(),
  })
  .strict()
  .refine(
    (d) => d.displayName !== undefined || d.preferredCity !== undefined,
    { message: "Provide at least one field to update" },
  );

export const assetTypeSchema = z.enum(["avatar", "community", "event", "post"]);

export const uploadRequestSchema = z
  .object({ contentType: z.string().min(1).max(100) })
  .strict();

// ── Communities / membership ──────────────────────────────────────────────────

export const createCommunitySchema = z
  .object({
    name: z.string().min(1).max(MAX_COMMUNITY_NAME_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .strict();

export const updateCommunitySchema = z
  .object({
    name: z.string().min(1).max(MAX_COMMUNITY_NAME_LENGTH).optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    imageKey: z.string().uuid().optional(),
  })
  .strict();

export const membershipRoleSchema = z
  .object({ role: z.enum(["member", "moderator", "admin"]) })
  .strict();

// ── Posts (communityId comes from /communities/:id/posts, not the body) ───────

export const createPostSchema = z
  .object({
    content: z.string().min(1).max(MAX_POST_LENGTH),
    imageKey: z.string().uuid().optional(),
  })
  .strict();

// ── Chat (communityId comes from the path) ────────────────────────────────────

export const createMessageSchema = z
  .object({ content: z.string().min(1).max(MAX_MESSAGE_LENGTH) })
  .strict();

// ── Events / RSVP (communityId comes from /communities/:id/events) ────────────

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_EVENT_TITLE_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    location: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
  })
  .strict();

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_EVENT_TITLE_LENGTH).optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    location: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .strict();

export const rsvpSchema = z
  .object({ status: z.enum(["going", "interested", "not_going"]) })
  .strict();

// ── Reports / blocks / notifications ──────────────────────────────────────────

export const createReportSchema = z
  .object({
    resourceType: z.enum(["post", "message", "user", "event", "community"]),
    resourceId: z.string().uuid(),
    reason: z.string().min(1).max(MAX_REPORT_REASON_LENGTH),
  })
  .strict();

export const blockSchema = z
  .object({ blockedUserId: z.string().uuid() })
  .strict();

export const notificationPreferencesUpdateSchema = z
  .object({
    communityPosts: z.boolean().optional(),
    events: z.boolean().optional(),
    eventReminders: z.boolean().optional(),
    communityInvites: z.boolean().optional(),
    memberJoins: z.boolean().optional(),
  })
  .strict();

export const registerPushTokenSchema = z
  .object({
    token: z.string().min(1),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();

export const deactivatePushTokenSchema = z
  .object({ token: z.string().min(1) })
  .strict();

// ── Pagination query schemas (lenient — extra query params are ignored) ───────

const MAX_CURSOR_PAGE_SIZE = 50;
const DEFAULT_CURSOR_PAGE_SIZE = 20;
const MAX_OFFSET_PAGE_SIZE = 100;
const DEFAULT_OFFSET_PAGE_SIZE = 25;

// Query params arrive as strings — coerce to numbers.
export const cursorPageQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CURSOR_PAGE_SIZE)
    .default(DEFAULT_CURSOR_PAGE_SIZE),
  cursor: z.string().optional(),
});

export const offsetPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
export type OffsetPageQuery = z.infer<typeof offsetPageQuerySchema>;
