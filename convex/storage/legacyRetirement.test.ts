import { afterEach, beforeEach, expect, test, vi } from "vitest";
const sdk = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = sdk.send; },
  HeadObjectCommand: class { kind = "HEAD"; constructor(public input: unknown) {} },
  HeadBucketCommand: class { kind = "BUCKET"; constructor(public input: unknown) {} },
  DeleteObjectCommand: class { kind = "DELETE"; constructor(public input: unknown) {} },
  GetObjectCommand: class {}, PutObjectCommand: class {},
}));
import { retireLegacyImageObject } from "./r2Client";
const source = { objectKey: "companies/exact/logo/legacy.png", etag: '"copied"', size: 100, contentType: "image/png" };
const head = { ETag: source.etag, ContentLength: source.size, ContentType: source.contentType };
beforeEach(() => {
  sdk.send.mockReset();
  for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: "test", R2_ENDPOINT: "https://test.r2.example.test", R2_BUCKET_NAME: "test-bucket", R2_ACCESS_KEY_ID: "fake", R2_SECRET_ACCESS_KEY: "fake" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); });
test("exact conditional DELETE is preceded by last authorization and followed by origin absence check", async () => {
  const order: string[] = [];
  sdk.send.mockImplementation(async command => { order.push(command.kind); if (order.length === 1) return head; if (command.kind === "DELETE") return { $metadata: { httpStatusCode: 204 } }; if (command.kind === "BUCKET") return { $metadata: { httpStatusCode: 200 } }; throw Object.assign(new Error(), { name: "NotFound", $metadata: { httpStatusCode: 404 } }); });
  await retireLegacyImageObject(source, async () => { order.push("AUTHORIZE"); });
  expect(order).toEqual(["HEAD", "AUTHORIZE", "DELETE", "HEAD", "BUCKET"]);
  expect(sdk.send.mock.calls[1][0].input).toEqual({ Bucket: "test-bucket", Key: source.objectKey, IfMatch: source.etag });
  expect(sdk.send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
});
test.each(["NoSuchKey", "NotFound"])("%s is idempotent but still requires current authorization", async name => {
  sdk.send.mockRejectedValueOnce(Object.assign(new Error(), { name, $metadata: { httpStatusCode: 404 } })).mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } }); const authorize = vi.fn();
  await retireLegacyImageObject(source, authorize); expect(authorize).toHaveBeenCalledTimes(1); expect(sdk.send).toHaveBeenCalledTimes(2);
});
test.each(["AccessDenied", "NoSuchBucket", "CredentialsProviderError"])("%s cannot be reported as origin retired", async name => {
  sdk.send.mockRejectedValue(Object.assign(new Error(), { name })); const authorize = vi.fn();
  await expect(retireLegacyImageObject(source, authorize)).rejects.toThrow(); expect(authorize).not.toHaveBeenCalled();
});
test.each([{ ...head, ETag: "changed" }, { ...head, ContentLength: 101 }, { ...head, ContentType: "image/jpeg" }])("changed source metadata fails without DELETE", async metadata => {
  sdk.send.mockResolvedValue(metadata); await expect(retireLegacyImageObject(source, vi.fn())).rejects.toThrow(); expect(sdk.send).toHaveBeenCalledTimes(1);
});
test("stale authorization and conditional provider refusal never fall back to unconditional DELETE", async () => {
  sdk.send.mockResolvedValueOnce(head);
  await expect(retireLegacyImageObject(source, async () => { throw new Error("stale"); })).rejects.toThrow(); expect(sdk.send).toHaveBeenCalledTimes(1);
  sdk.send.mockReset().mockResolvedValueOnce(head).mockRejectedValueOnce(Object.assign(new Error("precondition"), { $metadata: { httpStatusCode: 412 } }));
  await expect(retireLegacyImageObject(source, vi.fn())).rejects.toThrow(); expect(sdk.send).toHaveBeenCalledTimes(2);
});
test("delete response alone does not prove origin absence", async () => {
  sdk.send.mockResolvedValueOnce(head).mockResolvedValueOnce({ $metadata: { httpStatusCode: 204 } }).mockResolvedValueOnce(head);
  await expect(retireLegacyImageObject(source, vi.fn())).rejects.toThrow("still exists");
});
test("generic HEAD 404 from a missing bucket/gateway cannot mark the object absent", async () => {
  sdk.send.mockRejectedValueOnce(Object.assign(new Error(), { name: "NotFound", $metadata: { httpStatusCode: 404 } }))
    .mockRejectedValueOnce(Object.assign(new Error(), { name: "NotFound", $metadata: { httpStatusCode: 404 } }));
  const authorize = vi.fn(); await expect(retireLegacyImageObject(source, authorize)).rejects.toThrow(); expect(authorize).not.toHaveBeenCalled();
});
test("NotFound without an actual 404 response fails closed", async () => {
  sdk.send.mockRejectedValue(Object.assign(new Error(), { name: "NotFound" })); await expect(retireLegacyImageObject(source, vi.fn())).rejects.toThrow(); expect(sdk.send).toHaveBeenCalledTimes(1);
});
