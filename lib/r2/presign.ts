import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET } from "./client";

const PRESIGN_TTL_SECONDS = 60 * 15; // 15 minutes — enough for a chunked upload session

export function videoKeyFor(userId: string, runId: string, ext: string) {
  return `videos/${userId}/${runId}.${ext}`;
}

export function slidesKeyFor(userId: string, runId: string, ext: string) {
  return `slides/${userId}/${runId}.${ext}`;
}

export async function presignPutUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn: PRESIGN_TTL_SECONDS });
}

export async function presignGetUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn: PRESIGN_TTL_SECONDS });
}
