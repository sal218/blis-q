import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { redis } from "./redis";

// Cloudflare R2 object storage. R2 is S3-compatible, so the AWS SDK is used
// with R2's endpoint. The bucket must be created with EU jurisdiction selected
// (irreversible) — Article 9 data residency (TRANSFER §3.1, CLAUDE.md). All
// buckets are PRIVATE: files are only ever reachable via presigned URLs, and
// every uploaded object is renamed to a random UUID to prevent enumeration.

export type AssetType = "avatar" | "community" | "event" | "post" | "safeplace";

// The only content types an upload may declare / an object may hold (SW-1). The
// content type is signed into the presigned PUT (the client must match it) AND
// re-checked against the STORED object at confirm time, so neither a lying
// client nor a swapped object slips through.
export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type ImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const UPLOAD_URL_TTL_SECONDS = 15 * 60; // 15 min to complete an upload
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // 1 hour download link
const PENDING_CLAIM_TTL_SECONDS = UPLOAD_URL_TTL_SECONDS;

function isAllowedImageType(ct: string | undefined): ct is ImageContentType {
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(ct ?? "");
}

function bucketForAsset(type: AssetType): string {
  const bucket = {
    avatar: process.env.R2_BUCKET_AVATARS,
    community: process.env.R2_BUCKET_COMMUNITY_IMAGES,
    event: process.env.R2_BUCKET_EVENT_IMAGES,
    post: process.env.R2_BUCKET_POST_IMAGES,
    safeplace: process.env.R2_BUCKET_SAFE_PLACE_IMAGES,
  }[type];

  if (!bucket) {
    throw new Error(`R2 bucket env var not configured for asset type: ${type}`);
  }
  return bucket;
}

// Lazily created so local dev / tests without R2 credentials don't fail at
// import time — only when an upload/download is actually attempted.
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;

  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "R2 is not configured (missing R2_* environment variables)",
    );
  }

  client = new S3Client({
    region: "auto", // R2 ignores region; "auto" is the documented value
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

// Pending upload claims MUST be Redis-backed. On a multi-instance Fly.io deploy,
// an in-memory claim written on instance A is invisible to instance B — a
// confirm landing on B would fail silently. The in-memory Map below is a
// LOCAL-DEV fallback only (single instance). See CLAUDE.md "Upload Pending Claims".
const inMemoryClaims = new Map<string, string>();
// Claims are NAMESPACED by asset type: a bare UUID key alone can't say which
// bucket it belongs to, so confirm must supply the asset type and we HEAD/Delete
// against exactly that bucket (never inferred from the key).
const claimKey = (assetType: AssetType, key: string) =>
  `upload-claim:${assetType}:${key}`;

async function writeClaim(
  assetType: AssetType,
  key: string,
  userId: string,
): Promise<void> {
  if (redis) {
    await redis.set(claimKey(assetType, key), userId, {
      ex: PENDING_CLAIM_TTL_SECONDS,
    });
    return;
  }
  inMemoryClaims.set(claimKey(assetType, key), userId);
}

async function readClaim(
  assetType: AssetType,
  key: string,
): Promise<string | null> {
  if (redis) return redis.get<string>(claimKey(assetType, key));
  return inMemoryClaims.get(claimKey(assetType, key)) ?? null;
}

async function deleteClaim(assetType: AssetType, key: string): Promise<void> {
  if (redis) {
    await redis.del(claimKey(assetType, key));
    return;
  }
  inMemoryClaims.delete(claimKey(assetType, key));
}

/**
 * Create a presigned PUT URL for a new upload. The object is keyed by a random
 * UUID (never the original filename); the content type is validated against the
 * image allowlist and SIGNED into the PUT so the client must send a matching
 * `Content-Type` (SW-1). A pending claim (namespaced by asset type) records the
 * uploader so the upload can later be confirmed. Throws on a disallowed type.
 */
export async function createUploadUrl(
  assetType: AssetType,
  userId: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string }> {
  if (!isAllowedImageType(contentType)) {
    throw new Error(`Unsupported upload content type: ${contentType}`);
  }
  const key = randomUUID();
  const command = new PutObjectCommand({
    Bucket: bucketForAsset(assetType),
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
  await writeClaim(assetType, key, userId);
  return { uploadUrl, key };
}

/**
 * Confirm an upload belongs to the claiming user AND that the STORED object is a
 * valid image (allowlisted content type, ≤ 5 MB) — SW-1. On any failure the
 * object is deleted and the claim cleared; returns false. On success the claim
 * is cleared and the object is kept. Re-checking the stored object (not just the
 * claim) defends against a client that PUT something other than what it declared.
 */
export async function confirmUpload(
  assetType: AssetType,
  key: string,
  userId: string,
): Promise<boolean> {
  const claimedBy = await readClaim(assetType, key);
  if (!claimedBy || claimedBy !== userId) return false;

  const bucket = bucketForAsset(assetType);
  try {
    const head = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    const okType = isAllowedImageType(head.ContentType);
    const okSize = (head.ContentLength ?? Infinity) <= MAX_UPLOAD_BYTES;
    if (!okType || !okSize) {
      await getClient().send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
      await deleteClaim(assetType, key);
      return false;
    }
  } catch {
    // Object missing (never uploaded) or HEAD failed → not a valid upload.
    await deleteClaim(assetType, key);
    return false;
  }

  await deleteClaim(assetType, key);
  return true;
}

/** Create a presigned GET URL for downloading a stored object. */
export async function getDownloadUrl(
  assetType: AssetType,
  key: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketForAsset(assetType),
    Key: key,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}
