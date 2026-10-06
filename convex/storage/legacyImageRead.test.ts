import { afterEach, beforeEach, expect, test, vi } from "vitest";
const sdk = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = sdk.send; },
  HeadObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  DeleteObjectCommand: class {}, PutObjectCommand: class {},
}));
import { readLegacyImageObject } from "./r2Client";

beforeEach(() => {
  sdk.send.mockReset();
  for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: "test-account", R2_ENDPOINT: "https://test-account.r2.example.test", R2_BUCKET_NAME: "test-bucket", R2_ACCESS_KEY_ID: "fake", R2_SECRET_ACCESS_KEY: "fake" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); });
function response(chunks: number[][], declared = 4) {
  return { ContentLength: declared, ContentType: "image/png", ETag: '"exact-version"', Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk)); controller.close(); } }) } };
}
function setup(get = response([[1, 2], [3, 4]]), size = 4) {
  sdk.send.mockResolvedValueOnce({ ContentLength: size, ContentType: "image/png", ETag: '"exact-version"' }).mockResolvedValueOnce(get);
}
test("authenticated bounded full read uses IfMatch, never a public URL or truncated Range", async () => {
  setup(); const result = await readLegacyImageObject("companies/trusted/logo/source.png", 10);
  expect(result.bytes).toEqual(Uint8Array.of(1, 2, 3, 4));
  const request = sdk.send.mock.calls[1][0];
  expect(request.input).toEqual({ Bucket: "test-bucket", Key: "companies/trusted/logo/source.png", IfMatch: '"exact-version"' });
  expect(sdk.send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
});
test.each([0, 11, 4.5, undefined])("invalid/oversized HEAD size %s prevents GET", async size => {
  setup(undefined, size as number);
  // `undefined` is explicitly absent; setup's default is otherwise 4.
  if (size === undefined) sdk.send.mockReset().mockResolvedValueOnce({ ContentType: "image/png", ETag: "e" });
  await expect(readLegacyImageObject("key", 10)).rejects.toThrow(); expect(sdk.send).toHaveBeenCalledTimes(1);
});
test.each([response([[1, 2]]), response([[1, 2, 3, 4, 5]]), { ...response([[1, 2, 3, 4]]), ETag: "changed" }, { ...response([[1, 2, 3, 4]]), ContentType: "image/jpeg" }])("rejects truncation, extra bytes or changed source metadata", async get => {
  setup(get); await expect(readLegacyImageObject("key", 4)).rejects.toThrow();
});
