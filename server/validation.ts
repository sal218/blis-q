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

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
