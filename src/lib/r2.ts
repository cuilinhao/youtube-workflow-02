import { S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.R2_BUCKET_NAME?.trim();
const endpoint = process.env.R2_ENDPOINT?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const sessionToken = process.env.R2_SESSION_TOKEN?.trim();
const legacyToken = process.env.R2_TOKEN?.trim();

if (!bucket) {
  throw new Error('Missing R2_BUCKET_NAME environment variable');
}

if (!endpoint) {
  throw new Error('Missing R2_ENDPOINT environment variable');
}

if (!accessKeyId || !secretAccessKey) {
  throw new Error('Missing R2 access credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
}

if (!sessionToken && legacyToken) {
  console.warn(
    '[R2] Detected R2_TOKEN but no R2_SESSION_TOKEN. R2_TOKEN is ignored because it is not a valid STS session token. If you need temporary credentials, set R2_SESSION_TOKEN.',
  );
}

export const r2Bucket = bucket;

export const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  },
});

export function assertValidR2Key(key: string) {
  if (!key || typeof key !== 'string') {
    throw new Error('R2 object key is required');
  }

  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Invalid R2 object key');
  }
}
