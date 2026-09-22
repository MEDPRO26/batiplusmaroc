import {
  DeleteObjectCommand,
  GetObjectCommand,
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

export async function deletePublicMediaObject(objectKey: string) {
  const { bucket, s3 } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
