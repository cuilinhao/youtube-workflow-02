import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Bucket, s3Client, assertValidR2Key } from '@/lib/r2';
import { buildPublicUrl } from '@/lib/r2-url';

export const runtime = 'nodejs';

interface PresignBody {
  key?: string;
  contentType?: string;
  expiresIn?: number;
}

const DEFAULT_EXPIRES = 300; // seconds
const MAX_EXPIRES = 3600;
const REQUIRED_PREFIX = 'uploads/';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PresignBody;
    const key = body.key?.trim();
    const contentType = body.contentType?.trim();
    const expiresIn = Math.min(Math.max(body.expiresIn ?? DEFAULT_EXPIRES, 60), MAX_EXPIRES);
    console.log('[R2 Presign] 请求参数', { key, contentType, expiresIn });

    if (!key) {
      return NextResponse.json({ error: 'Missing object key' }, { status: 400 });
    }

    if (!contentType) {
      return NextResponse.json({ error: 'Missing contentType' }, { status: 400 });
    }

    if (!key.startsWith(REQUIRED_PREFIX)) {
      return NextResponse.json({ error: `Object key must start with "${REQUIRED_PREFIX}"` }, { status: 400 });
    }

    assertValidR2Key(key);

    const command = new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    const publicUrl = buildPublicUrl(key);

    const payload = { url, key, publicUrl };
    console.log('[R2 Presign] 返回参数', payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to create R2 upload presigned URL', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to create presigned URL' },
      { status: 500 },
    );
  }
}
