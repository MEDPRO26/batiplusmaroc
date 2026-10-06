import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PUBLIC_MEDIA_UPLOAD_TTL_SECONDS } from "./constants";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required R2 environment variable: ${name}`);
  return value;
}

function configuration() {
  const accountId = requiredEnvironment("R2_ACCOUNT_ID");
  const endpoint = requiredEnvironment("R2_ENDPOINT");
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:" || !parsedEndpoint.hostname.startsWith(`${accountId}.`)) {
    throw new Error("R2_ENDPOINT does not match R2_ACCOUNT_ID");
  }
  return {
    bucket: requiredEnvironment("R2_BUCKET_NAME"),
    endpoint,
    accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
  };
}

function client() {
  const config = configuration();
  return {
    bucket: config.bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export async function createPresignedPutUrl(objectKey: string, contentType: string) {
  const { bucket, s3 } = client();
  return await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: PUBLIC_MEDIA_UPLOAD_TTL_SECONDS },
  );
}

export async function headPublicMediaObject(objectKey: string) {
  const { bucket, s3 } = client();
  return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function readPublicMediaSignature(objectKey: string) {
  const { bucket, s3 } = client();
  const result = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Range: "bytes=0-15",
  }));
  if (!result.Body) return new Uint8Array();
  return await result.Body.transformToByteArray();
}

export async function readPublicMediaBytes(objectKey: string, maximumBytes: number) {
  const { bucket, s3 } = client();
  const result = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Range: `bytes=0-${Math.max(0, Math.trunc(maximumBytes) - 1)}`,
  }));
  if (!result.Body) return new Uint8Array();
  return await result.Body.transformToByteArray();
}

/** Full, bounded authenticated read for ingestion. Never follows a public delivery URL. */
export async function readLegacyImageObject(objectKey: string, maximumBytes: number) {
  const { bucket, s3 } = client();
  const signal = AbortSignal.timeout(30_000);
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }), { abortSignal: signal });
  const size = head.ContentLength;
  if (!Number.isInteger(size) || !size || size < 1 || size > maximumBytes || !head.ETag || !head.ContentType) {
    throw new Error("Invalid legacy image metadata");
  }
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey, IfMatch: head.ETag }), { abortSignal: signal });
  if (!result.Body || result.ContentLength !== size || result.ETag !== head.ETag || result.ContentType !== head.ContentType) {
    if (result.Body) await result.Body.transformToWebStream().cancel();
    throw new Error("Legacy image changed during read");
  }
  const reader = result.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > maximumBytes || received > size) throw new Error("Legacy image exceeds limit");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (received !== size) throw new Error("Incomplete legacy image");
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, contentType: head.ContentType, size, etag: head.ETag };
}

export async function deletePublicMediaObject(objectKey: string) {
  const { bucket, s3 } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

function objectNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? error.name : null;
  const metadata = "$metadata" in error ? error.$metadata : null;
  return (name === "NoSuchKey" || name === "NotFound") && !!metadata && typeof metadata === "object" &&
    "httpStatusCode" in metadata && metadata.httpStatusCode === 404;
}

/** Gate-protected retirement only. Never downgrade conditional deletion to an unconditional call. */
export async function retireLegacyImageObject(
  source: { objectKey: string; etag: string; size: number; contentType: string },
  authorizeDeletion: () => Promise<void>,
) {
  const { bucket, s3 } = client(); const signal = AbortSignal.timeout(30_000);
  const head = async () => {
    try { return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: source.objectKey }), { abortSignal: signal }); }
    catch (error) {
      if (!objectNotFound(error)) throw error;
      // S3 HEAD has no error body: NotFound can mean a missing bucket/gateway, not
      // an absent object. Verify authenticated access to this exact configured bucket.
      const verified = await s3.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: signal });
      if (verified.$metadata.httpStatusCode !== 200) throw new Error("Bucket access not confirmed");
      return null;
    }
  };
  const metadata = await head();
  if (metadata && (metadata.ETag !== source.etag || metadata.ContentLength !== source.size || metadata.ContentType !== source.contentType)) {
    throw new Error("Legacy source changed");
  }
  await authorizeDeletion();
  if (!metadata) return;
  const result = await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: source.objectKey, IfMatch: source.etag }), { abortSignal: signal });
  if (result.$metadata.httpStatusCode !== 200 && result.$metadata.httpStatusCode !== 204) throw new Error("Deletion not confirmed");
  if (await head()) throw new Error("Legacy source still exists");
}
