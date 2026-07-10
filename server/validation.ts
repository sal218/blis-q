import { z } from "zod";
import {
  EVENT_CATEGORIES,
  SAFE_PLACE_CATEGORIES,
  ACCESSIBILITY_FEATURES,
  RESOURCE_CATEGORIES,
  CRISIS_CONTACT_CATEGORIES,
  NEWS_CATEGORIES,
} from "@shared/types";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "./objectStorage";

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
const MAX_SAFE_PLACE_NAME_LENGTH = 150;
const MAX_SAFE_PLACE_ADDRESS_LENGTH = 200;
const MAX_SAFE_PLACE_CITY_LENGTH = 100;
const MAX_REPORT_REASON_LENGTH = 1000;
const MAX_RESOLUTION_LENGTH = 1000;
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

// Token refresh (docs/API.md §4, tracker P-10). The mobile app posts its stored
// Supabase refresh token; the backend exchanges it for a fresh session. Bounded
// to a sane max so a malformed/huge body is rejected at the boundary.
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).max(2048),
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
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DISPLAY_NAME_LENGTH)
      .optional(),
    // city-level text; blank (or whitespace) CLEARS the city → null, so a user
    // can remove it. Omitted → undefined → not touched.
    preferredCity: z
      .string()
      .trim()
      .max(100)
      .transform((v) => (v.length === 0 ? null : v))
      .optional(),
  })
  .strict()
  .refine((d) => d.displayName !== undefined || d.preferredCity !== undefined, {
    message: "Provide at least one field to update",
  });

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

// ── Admin communities ─────────────────────────────────────────────────────────
// Server-side trimming (do not rely on UI). `.trim()` runs before `.min(1)`, so
// a whitespace-only name collapses to "" and is rejected. No `imageKey` here:
// community image upload (R2) is deferred, so admin must not accept it.
export const adminCreateCommunitySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_COMMUNITY_NAME_LENGTH),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .strict();

export const adminUpdateCommunitySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_COMMUNITY_NAME_LENGTH).optional(),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op.
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: "At least one field is required",
  });

// ── Safe places (admin-curated venues) ────────────────────────────────────────
// Coordinates describe a public VENUE (admin data), never a user's location
// (§5.8). latitude/longitude are BOTH-or-NEITHER (a lone coordinate is a bug),
// range-checked. category is a frozen predefined venue-type (never identity).
export const safePlaceCategorySchema = z.enum(SAFE_PLACE_CATEGORIES);

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

// Reject a one-sided coordinate on any schema that carries lat/lng.
const bothOrNeitherCoords = (d: {
  latitude?: number;
  longitude?: number;
}): boolean => (d.latitude === undefined) === (d.longitude === undefined);
const COORDS_REFINE = {
  message: "latitude and longitude must be provided together",
  path: ["latitude"] as (string | number)[],
};

export const createSafePlaceSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_SAFE_PLACE_NAME_LENGTH),
    category: safePlaceCategorySchema,
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    address: z.string().trim().max(MAX_SAFE_PLACE_ADDRESS_LENGTH).optional(),
    city: z.string().trim().max(MAX_SAFE_PLACE_CITY_LENGTH).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    // The R2 key from a prior upload-url + PUT (confirmed server-side). Omitted =
    // no image. `null` is meaningless on create (there's nothing to clear).
    imageKey: z.string().uuid().optional(),
    // Confirmed-present accessibility features (a frozen set — out-of-set → 400,
    // never free-text). Deduped in storage. Omitted = none.
    accessibilityFeatures: z
      .array(z.enum(ACCESSIBILITY_FEATURES))
      .max(20)
      .optional(),
  })
  .strict()
  .refine(bothOrNeitherCoords, COORDS_REFINE);

// POST /admin/safe-places/upload-url body — the client declares the image's
// content type up front so it can be signed into the presigned PUT (SW-1).
export const uploadUrlSchema = z
  .object({ contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES) })
  .strict();

export const updateSafePlaceSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_SAFE_PLACE_NAME_LENGTH).optional(),
    category: safePlaceCategorySchema.optional(),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    address: z.string().trim().max(MAX_SAFE_PLACE_ADDRESS_LENGTH).optional(),
    city: z.string().trim().max(MAX_SAFE_PLACE_CITY_LENGTH).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    // undefined = leave the image unchanged · null = REMOVE it · uuid = set/replace.
    imageKey: z.string().uuid().nullable().optional(),
    // undefined = unchanged · a provided array = full replace ([] clears).
    accessibilityFeatures: z
      .array(z.enum(ACCESSIBILITY_FEATURES))
      .max(20)
      .optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op.
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field is required",
  })
  // Same one-sided-coordinate guard as create (a PATCH can still touch no coords).
  .refine(bothOrNeitherCoords, COORDS_REFINE);

// ── Resources (admin-curated Support & Education content, P-37) ───────────────
// Admin-published guides/articles (body) + curated org/link entries (url).
// category is a frozen predefined content topic (never identity — Article-9-safe).
const MAX_RESOURCE_TITLE_LENGTH = 200;
const MAX_RESOURCE_BODY_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;
const MAX_RESOURCE_SEARCH_LENGTH = 100;

export const resourceCategorySchema = z.enum(RESOURCE_CATEGORIES);

export const createResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_RESOURCE_TITLE_LENGTH),
    category: resourceCategorySchema,
    body: z.string().trim().min(1).max(MAX_RESOURCE_BODY_LENGTH),
    // Optional external link. Omitted = a plain in-app article/guide.
    url: z.string().trim().url().max(MAX_URL_LENGTH).optional(),
    featured: z.boolean().optional(),
  })
  .strict();

export const updateResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_RESOURCE_TITLE_LENGTH).optional(),
    category: resourceCategorySchema.optional(),
    body: z.string().trim().min(1).max(MAX_RESOURCE_BODY_LENGTH).optional(),
    // undefined = unchanged · null = REMOVE the link · string = set/replace.
    url: z.string().trim().url().max(MAX_URL_LENGTH).nullable().optional(),
    featured: z.boolean().optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op.
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

// ── News (admin-curated pillar-3 News content, P-31) ──────────────────────────
// Admin-published editorial (full body) + externally-sourced items (summary +
// sourceUrl). category is a frozen predefined content topic (never identity —
// Article-9-safe). Mirrors the resources schemas.
const MAX_NEWS_TITLE_LENGTH = 200;
const MAX_NEWS_SUMMARY_LENGTH = 500;
const MAX_NEWS_BODY_LENGTH = 20000;
const MAX_NEWS_SOURCE_LENGTH = 120;
const MAX_NEWS_SEARCH_LENGTH = 100;

export const newsCategorySchema = z.enum(NEWS_CATEGORIES);

export const createNewsSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_NEWS_TITLE_LENGTH),
    summary: z.string().trim().min(1).max(MAX_NEWS_SUMMARY_LENGTH),
    // Full editorial text. Omitted = an externally-sourced item (read at source).
    body: z.string().trim().min(1).max(MAX_NEWS_BODY_LENGTH).optional(),
    category: newsCategorySchema,
    source: z.string().trim().min(1).max(MAX_NEWS_SOURCE_LENGTH),
    // Optional external link ("Czytaj u źródła").
    sourceUrl: z.string().trim().url().max(MAX_URL_LENGTH).optional(),
    featured: z.boolean().optional(),
  })
  .strict();

export const updateNewsSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_NEWS_TITLE_LENGTH).optional(),
    summary: z.string().trim().min(1).max(MAX_NEWS_SUMMARY_LENGTH).optional(),
    // undefined = unchanged · null = clear the body · string = set/replace.
    body: z
      .string()
      .trim()
      .min(1)
      .max(MAX_NEWS_BODY_LENGTH)
      .nullable()
      .optional(),
    category: newsCategorySchema.optional(),
    source: z.string().trim().min(1).max(MAX_NEWS_SOURCE_LENGTH).optional(),
    // undefined = unchanged · null = REMOVE the link · string = set/replace.
    sourceUrl: z
      .string()
      .trim()
      .url()
      .max(MAX_URL_LENGTH)
      .nullable()
      .optional(),
    featured: z.boolean().optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op.
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

// ── Crisis contacts (admin-curated "Pomoc w kryzysie" helplines, P-37) ─────────
// Admin-published crisis/help contacts (112, hotlines, LGBT org lines) with a
// tap-to-call phone. category is a frozen predefined SERVICE type (Article-9-safe).
const MAX_CRISIS_NAME_LENGTH = 120;
const MAX_CRISIS_DESCRIPTION_LENGTH = 500;
const MAX_CRISIS_HOURS_LENGTH = 80;
const MAX_CRISIS_PHONE_LENGTH = 32;

export const crisisContactCategorySchema = z.enum(CRISIS_CONTACT_CATEGORIES);

// Life-critical, so permissive-but-bounded: accepts 112, "116 123",
// "+48 22 628 52 22", "800 70 2222" (an optional leading +, then digits, spaces,
// dashes, parentheses) and rejects non-phone text. Requires ≥3 actual digits.
const crisisPhoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(MAX_CRISIS_PHONE_LENGTH)
  .regex(/^\+?[0-9][0-9 ()-]*$/, "Invalid phone number")
  .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 3, {
    message: "Phone number must contain at least 3 digits",
  });

export const createCrisisContactSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_CRISIS_NAME_LENGTH),
    phone: crisisPhoneSchema,
    description: z.string().trim().min(1).max(MAX_CRISIS_DESCRIPTION_LENGTH),
    // Optional availability text. Omitted = the card hides the hours pill.
    hours: z.string().trim().min(1).max(MAX_CRISIS_HOURS_LENGTH).optional(),
    category: crisisContactCategorySchema,
    // Admin freshness stamp: true ⇒ verifiedAt = now(), false/omitted ⇒ null.
    verified: z.boolean().optional(),
  })
  .strict();

export const updateCrisisContactSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_CRISIS_NAME_LENGTH).optional(),
    phone: crisisPhoneSchema.optional(),
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_CRISIS_DESCRIPTION_LENGTH)
      .optional(),
    // undefined = unchanged · null = REMOVE the hours · string = set/replace.
    hours: z
      .string()
      .trim()
      .min(1)
      .max(MAX_CRISIS_HOURS_LENGTH)
      .nullable()
      .optional(),
    category: crisisContactCategorySchema.optional(),
    // true ⇒ stamp verifiedAt now · false ⇒ clear · omitted ⇒ leave unchanged.
    verified: z.boolean().optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op.
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

// OSM import (slice SP-2). osm-search takes a city + category; the bulk endpoint
// takes an array of curated candidates. osmId format-locked to an OSM element ref.
const osmIdSchema = z
  .string()
  .trim()
  .regex(/^(node|way|relation)\/\d+$/);

export const osmSearchSchema = z
  .object({
    city: z.string().trim().min(1).max(MAX_SAFE_PLACE_CITY_LENGTH),
    category: safePlaceCategorySchema,
  })
  .strict();

const bulkSafePlaceItemSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_SAFE_PLACE_NAME_LENGTH),
    category: safePlaceCategorySchema,
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    address: z.string().trim().max(MAX_SAFE_PLACE_ADDRESS_LENGTH).optional(),
    city: z.string().trim().max(MAX_SAFE_PLACE_CITY_LENGTH).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    osmId: osmIdSchema.optional(),
  })
  .strict()
  .refine(bothOrNeitherCoords, COORDS_REFINE);

export const bulkCreateSafePlacesSchema = z
  .array(bulkSafePlaceItemSchema)
  .min(1)
  .max(100);

// (safePlacesListQuerySchema is defined below, after the offset-page constants.)

// ── Posts (communityId comes from /communities/:id/posts, not the body) ───────

export const createPostSchema = z
  .object({
    content: z.string().min(1).max(MAX_POST_LENGTH),
    imageKey: z.string().uuid().optional(),
  })
  .strict();

// Post create as served this slice: text-only (R2/image upload deferred, so
// `imageKey` is rejected by .strict()) and trimmed server-side — a whitespace-
// only body collapses to "" and fails .min(1).
export const postCreateBodySchema = z
  .object({
    content: z.string().trim().min(1).max(MAX_POST_LENGTH),
  })
  .strict();

// POST /posts/:id/report body — just the reason (resourceType/resourceId come
// from the path). Trimmed; mirrors createReportSchema's reason rule.
export const postReportSchema = z
  .object({
    reason: z.string().trim().min(1).max(MAX_REPORT_REASON_LENGTH),
  })
  .strict();

// ── Chat (communityId comes from the path) ────────────────────────────────────

// Chat message create: text-only, trimmed server-side so a whitespace-only body
// collapses to "" and fails .min(1) → 400 (mirrors postCreateBodySchema).
export const createMessageSchema = z
  .object({ content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) })
  .strict();

// POST /messages/:id/report body — just the reason (resourceType/resourceId come
// from the path). Trimmed; mirrors postReportSchema.
export const messageReportSchema = z
  .object({
    reason: z.string().trim().min(1).max(MAX_REPORT_REASON_LENGTH),
  })
  .strict();

// ── Events / RSVP (communityId comes from /communities/:id/events) ────────────

// Text fields are trimmed server-side so a whitespace-only title collapses to ""
// and fails .min(1) → 400 (mirrors postCreateBodySchema). endsAt (when present)
// must be strictly after startsAt. NOTE: this refine only fires when BOTH dates
// are in the body — a one-sided PATCH is range-checked against the MERGED
// existing/proposed value in the route (storage.updateEvent), the authoritative
// guard.
// Predefined event category (slice D). z.enum over the frozen EVENT_CATEGORIES
// tuple (single source of truth in shared/types.ts) — any other value is a 400.
// There is no PG enum type; the DB column is plain text, validated here.
export const eventCategorySchema = z.enum(EVENT_CATEGORIES);

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_EVENT_TITLE_LENGTH),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    location: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    category: eventCategorySchema.optional(),
  })
  .strict()
  .refine((d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_EVENT_TITLE_LENGTH).optional(),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    location: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    category: eventCategorySchema.optional(),
  })
  .strict()
  // PATCH must change something — an empty body is a 400, not a silent no-op
  // (mirrors adminUpdateCommunitySchema; prevents a phantom event.updated audit).
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field is required",
  })
  // Range check when both dates are in the same body; the merged-candidate check
  // in storage.updateEvent covers one-sided PATCHes.
  .refine(
    (d) =>
      !d.startsAt || !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

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

// ── Admin moderation actions (docs/API.md §14) ────────────────────────────────

// PATCH /api/admin/reports/:id — resolve or dismiss a queued report. Optional
// trimmed, bounded resolution note. Strict so unknown fields are rejected.
export const adminReportResolveSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    resolution: z.string().trim().min(1).max(MAX_RESOLUTION_LENGTH).optional(),
  })
  .strict();

// POST /api/admin/moderation/remove-content — posts and events (message removal
// lands with chat, Sprint 5). resourceId is the target post/event id; the route
// branches to storage.adminRemovePost / adminRemoveEvent on resourceType.
export const adminRemoveContentSchema = z
  .object({
    resourceType: z.enum(["post", "event"]),
    resourceId: z.string().uuid(),
  })
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

// GET /events query: the cursor-page fields + an optional predefined category
// filter (slice D). A dedicated schema (not an extension of the shared
// cursorPageQuerySchema, which posts/chat also use) so the category filter stays
// events-only. An explicit but invalid category value fails z.enum → 400; an
// absent category means "no filter". Like the other query schemas, unknown extra
// keys are ignored (not .strict()).
export const eventsListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CURSOR_PAGE_SIZE)
    .default(DEFAULT_CURSOR_PAGE_SIZE),
  cursor: z.string().optional(),
  category: eventCategorySchema.optional(),
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

// GET /safe-places query: offset page + optional predefined category + city +
// an ephemeral `near=lat,lng` (used ONLY for this query's distance sort — never
// stored/logged/analytics, §5.8). A dedicated schema so the filters stay
// safe-places-only. An invalid category or malformed/out-of-range near → 400.
export const safePlacesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  category: safePlaceCategorySchema.optional(),
  city: z.string().trim().min(1).max(MAX_SAFE_PLACE_CITY_LENGTH).optional(),
  // Free-text search: case-insensitive substring over name + city + address
  // (the mobile type-ahead box). LIKE metachars are escaped in storage. Blank
  // is dropped to `undefined` (min 1 after trim → treated as "no filter").
  search: z.string().trim().min(1).max(MAX_SAFE_PLACE_NAME_LENGTH).optional(),
  // "lat,lng" → a validated { lat, lng } tuple (or a 400).
  near: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const parts = v.split(",");
      // Trim + require BOTH components non-empty first: Number("") and
      // Number("  ") are 0, so without this `near=,` / `52.2,` / `,21` would
      // silently become valid coordinates instead of a 400.
      const latStr = parts[0]?.trim();
      const lngStr = parts[1]?.trim();
      const lat = Number(latStr);
      const lng = Number(lngStr);
      const ok =
        parts.length === 2 &&
        !!latStr &&
        !!lngStr &&
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180;
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "near must be 'lat,lng' within valid ranges",
        });
        return z.NEVER;
      }
      return { lat, lng };
    }),
});

// Resources list (P-37): offset/page + an optional category filter + an optional
// server-side search (case-insensitive substring over title+body, LIKE-escaped).
export const resourcesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  category: resourceCategorySchema.optional(),
  // Optional case-insensitive substring search over title + body (LIKE-escaped
  // in storage). Blank/whitespace is rejected by min(1) after trim.
  search: z.string().trim().min(1).max(MAX_RESOURCE_SEARCH_LENGTH).optional(),
});

// News list (P-31): offset/page + an optional category filter + an optional
// server-side search (case-insensitive substring over title+summary+body,
// LIKE-escaped). Mirrors resourcesListQuerySchema.
export const newsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  category: newsCategorySchema.optional(),
  // Optional case-insensitive substring over title + summary + body (LIKE-escaped
  // in storage). Blank/whitespace is rejected by min(1) after trim.
  search: z.string().trim().min(1).max(MAX_NEWS_SEARCH_LENGTH).optional(),
});

// Crisis contacts list (P-37): offset/page + an optional category filter. NO
// search — the list is short and curated; the safety page uses category chips.
export const crisisContactsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  category: crisisContactCategorySchema.optional(),
});

// Admin reports queue: offset/page + optional status filter (read-only this
// slice — resolve/dismiss is a Sprint-4 moderation action).
export const adminReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  status: z.enum(["pending", "reviewing", "resolved", "dismissed"]).optional(),
});

// Admin user directory: offset/page + optional search + status filter.
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET_PAGE_SIZE)
    .default(DEFAULT_OFFSET_PAGE_SIZE),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "banned"]).optional(),
});

// POST /api/admin/moderation/ban|unban body — just the target user id.
export const adminBanUserSchema = z
  .object({ userId: z.string().uuid() })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateSafePlaceInput = z.infer<typeof createSafePlaceSchema>;
export type UpdateSafePlaceInput = z.infer<typeof updateSafePlaceSchema>;
export type SafePlacesListQuery = z.infer<typeof safePlacesListQuerySchema>;
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourcesListQuery = z.infer<typeof resourcesListQuerySchema>;
export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type NewsListQuery = z.infer<typeof newsListQuerySchema>;
export type CreateCrisisContactInput = z.infer<
  typeof createCrisisContactSchema
>;
export type UpdateCrisisContactInput = z.infer<
  typeof updateCrisisContactSchema
>;
export type CrisisContactsListQuery = z.infer<
  typeof crisisContactsListQuerySchema
>;
export type OsmSearchInput = z.infer<typeof osmSearchSchema>;
export type BulkCreateSafePlacesInput = z.infer<
  typeof bulkCreateSafePlacesSchema
>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
export type EventsListQuery = z.infer<typeof eventsListQuerySchema>;
export type OffsetPageQuery = z.infer<typeof offsetPageQuerySchema>;
