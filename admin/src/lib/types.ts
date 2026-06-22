// DTO shapes the admin dashboard consumes. The admin app has no @shared alias,
// so these mirror the server's response shapes (docs/API.md §2/§7/§12) — keep
// them in sync if the API contract changes.

export type OffsetPage<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CommunityDTO = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  memberCount: number;
  createdAt: string;
  membership: { role: string } | null;
};

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export type ReportDTO = {
  id: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
};

// Admin-only report view — what GET /api/admin/reports returns (since #22): the
// public ReportDTO plus the moderation fields (reviewer/time/resolution).
export type AdminReportDTO = ReportDTO & {
  reviewedById: string | null;
  reviewedAt: string | null;
  resolution: string | null;
};
