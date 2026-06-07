import { z } from "zod";

// Zod schemas for the backend request boundary. Every mutation route validates
// its body against one of these before doing anything else (CLAUDE.md §6,
// ENGINEERING_STANDARDS). Schemas are added here per feature; this scaffold
// covers registration/consent and the core content-creation paths.

// Field limits — kept local to this file (ENGINEERING_STANDARDS §8). Promote to
// shared/constants.ts only if the client needs the same values.
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_COMMUNITY_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_POST_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_EVENT_TITLE_LENGTH = 150;
const MAX_REPORT_REASON_LENGTH = 1000;
const MIN_PASSWORD_LENGTH = 8;

// Consent purposes recorded in consent_records (COMPLIANCE §5.1). Registration
// requires at least account_creation — enforced by the route, not here.
export const consentTypeSchema = z.enum([
  "account_creation",
  "marketing_emails",
  "analytics",
  "location_data",
]);

// Registration requires explicit consent — the policy version the user agreed
// to is captured so a later privacy-policy bump can force re-consent (§5.1).
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
  consentedTypes: z.array(consentTypeSchema).min(1),
  policyVersion: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(254),
});

export const createCommunitySchema = z.object({
  name: z.string().min(1).max(MAX_COMMUNITY_NAME_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
});

export const createPostSchema = z.object({
  communityId: z.string().uuid(),
  content: z.string().min(1).max(MAX_POST_LENGTH),
  imageKey: z.string().uuid().optional(),
});

export const createMessageSchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

export const createEventSchema = z.object({
  communityId: z.string().uuid(),
  title: z.string().min(1).max(MAX_EVENT_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  location: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
});

export const createReportSchema = z.object({
  resourceType: z.enum(["post", "message", "user", "event", "community"]),
  resourceId: z.string().uuid(),
  reason: z.string().min(1).max(MAX_REPORT_REASON_LENGTH),
});

export const registerPushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

export const deactivatePushTokenSchema = z.object({
  token: z.string().min(1),
});

// ── Pagination query schemas (docs/API.md §Conventions) ───────────────────────

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

// ── Auth / account ────────────────────────────────────────────────────────────

export const googleSignInSchema = z.object({
  idToken: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
});

export const withdrawConsentSchema = z.object({
  consentType: consentTypeSchema,
});

// ── Profile / uploads ─────────────────────────────────────────────────────────

// 🚧 preferredCity is city-level only — no GPS coordinates (COMPLIANCE §5.8).
export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
    preferredCity: z.string().max(100).optional(),
    avatarKey: z.string().uuid().optional(),
  })
  .strict();

export const assetTypeSchema = z.enum([
  "avatar",
  "community",
  "event",
  "post",
]);

export const uploadRequestSchema = z.object({
  contentType: z.string().min(1).max(100),
});

// ── Communities / membership ──────────────────────────────────────────────────

export const updateCommunitySchema = z
  .object({
    name: z.string().min(1).max(MAX_COMMUNITY_NAME_LENGTH).optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    imageKey: z.string().uuid().optional(),
  })
  .strict();

export const membershipRoleSchema = z.object({
  role: z.enum(["member", "moderator", "admin"]),
});

// ── Events / RSVP ─────────────────────────────────────────────────────────────

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_EVENT_TITLE_LENGTH).optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    location: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .strict();

export const rsvpSchema = z.object({
  status: z.enum(["going", "interested", "not_going"]),
});

// ── Blocks / notifications ────────────────────────────────────────────────────

export const blockSchema = z.object({
  blockedUserId: z.string().uuid(),
});

// All keys optional — partial update of notification_preferences booleans.
export const notificationPreferencesUpdateSchema = z
  .object({
    communityPosts: z.boolean().optional(),
    events: z.boolean().optional(),
    eventReminders: z.boolean().optional(),
    communityInvites: z.boolean().optional(),
    memberJoins: z.boolean().optional(),
  })
  .strict();

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
