// Unit-style coverage for the R2 helper (SP-6a / SW-1). The AWS S3 SDK, the
// presigner and Redis are all MOCKED — no network, no real bucket. Redis is
// null so the in-memory claim fallback is exercised.
jest.mock("../redis", () => ({ redis: null }));

const sendMock = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn((args) => ({ __cmd: "put", args })),
  GetObjectCommand: jest.fn((args) => ({ __cmd: "get", args })),
  HeadObjectCommand: jest.fn((args) => ({ __cmd: "head", args })),
  DeleteObjectCommand: jest.fn((args) => ({ __cmd: "delete", args })),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(async () => "https://signed.example/url"),
}));

process.env.R2_ACCOUNT_ID = "acc";
process.env.R2_ACCESS_KEY_ID = "key";
process.env.R2_SECRET_ACCESS_KEY = "secret";
process.env.R2_ENDPOINT = "https://r2.example";
process.env.R2_BUCKET_SAFE_PLACE_IMAGES = "sp-bucket";

import { createUploadUrl, confirmUpload } from "../objectStorage";
import {
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const putCtor = PutObjectCommand as unknown as jest.Mock;
const headCtor = HeadObjectCommand as unknown as jest.Mock;
const deleteCtor = DeleteObjectCommand as unknown as jest.Mock;
const getSignedUrlMock = getSignedUrl as unknown as jest.Mock;

beforeEach(() => {
  sendMock.mockReset();
  putCtor.mockClear();
  headCtor.mockClear();
  deleteCtor.mockClear();
  getSignedUrlMock.mockClear();
});

describe("createUploadUrl (SW-1: content-type allowlist + signed PUT)", () => {
  it("rejects a non-image content type", async () => {
    await expect(
      createUploadUrl("safeplace", "u1", "text/plain"),
    ).rejects.toThrow(/content type/i);
    expect(putCtor).not.toHaveBeenCalled();
  });

  it("signs the PUT with the declared image content type + a uuid key", async () => {
    const { uploadUrl, key } = await createUploadUrl(
      "safeplace",
      "u1",
      "image/png",
    );
    expect(uploadUrl).toBe("https://signed.example/url");
    expect(key).toMatch(/^[0-9a-f-]{36}$/); // uuid, not the filename
    expect(putCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "sp-bucket",
        Key: key,
        ContentType: "image/png",
      }),
    );
    // SW-1: the content type must be BOUND into the signature (not just set on
    // the command), so R2 rejects a PUT with a mismatched Content-Type.
    const opts = getSignedUrlMock.mock.calls[0][2];
    expect([...opts.signableHeaders]).toContain("content-type");
  });
});

describe("confirmUpload (SW-1: claim + HEAD validation)", () => {
  it("returns false for a wrong / missing claimant and never HEADs or deletes", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/jpeg");
    const ok = await confirmUpload("safeplace", key, "someone-else");
    expect(ok).toBe(false);
    // Intentionally does NOT delete or clear: a non-owner must never be able to
    // remove someone else's pending upload. Orphans from abandoned/expired
    // claims are swept by a deferred R2 lifecycle job (P-40).
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("accepts a valid claim + a valid image object", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/jpeg");
    sendMock.mockResolvedValueOnce({
      ContentType: "image/jpeg",
      ContentLength: 1024,
    });
    const ok = await confirmUpload("safeplace", key, "owner");
    expect(ok).toBe(true);
    expect(headCtor).toHaveBeenCalledWith({ Bucket: "sp-bucket", Key: key });
    expect(deleteCtor).not.toHaveBeenCalled();
  });

  it("rejects + deletes an over-size object (>5 MB)", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/png");
    sendMock
      .mockResolvedValueOnce({
        ContentType: "image/png",
        ContentLength: 6 * 1024 * 1024,
      })
      .mockResolvedValueOnce({}); // the Delete
    const ok = await confirmUpload("safeplace", key, "owner");
    expect(ok).toBe(false);
    expect(deleteCtor).toHaveBeenCalledWith({ Bucket: "sp-bucket", Key: key });
  });

  it("rejects + deletes a non-image object (client lied about the type)", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/webp");
    sendMock
      .mockResolvedValueOnce({
        ContentType: "application/pdf",
        ContentLength: 10,
      })
      .mockResolvedValueOnce({});
    const ok = await confirmUpload("safeplace", key, "owner");
    expect(ok).toBe(false);
    expect(deleteCtor).toHaveBeenCalled();
  });

  it("returns false when the object was never uploaded (HEAD throws)", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/jpeg");
    sendMock.mockRejectedValueOnce(new Error("NotFound"));
    const ok = await confirmUpload("safeplace", key, "owner");
    expect(ok).toBe(false);
  });

  it("a claim can only be confirmed once", async () => {
    const { key } = await createUploadUrl("safeplace", "owner", "image/jpeg");
    sendMock.mockResolvedValueOnce({
      ContentType: "image/jpeg",
      ContentLength: 1024,
    });
    expect(await confirmUpload("safeplace", key, "owner")).toBe(true);
    // claim cleared → a second confirm fails before any HEAD
    expect(await confirmUpload("safeplace", key, "owner")).toBe(false);
  });
});
