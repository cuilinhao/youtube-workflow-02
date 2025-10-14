import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Bucket, s3Client, assertValidR2Key } from '@/lib/r2';

export const runtime = 'nodejs';

const DEFAULT_EXPIRES = 300; // seconds
const MAX_EXPIRES = 3600;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key')?.trim();
    const expires = searchParams.get('expiresIn');
    const expiresInRaw = expires ? Number.parseInt(expires, 10) : DEFAULT_EXPIRES;
    const expiresIn = Math.min(Math.max(expiresInRaw, 60), MAX_EXPIRES);
    console.log('[R2 Presign-GET] 请求参数', { key, expiresIn });

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    assertValidR2Key(key);

    const command = new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    console.log('[R2 Presign-GET] 返回参数', { key, url });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Failed to create R2 get presigned URL', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to create presigned URL' },
      { status: 500 },
    );
  }
}
