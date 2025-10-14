import { NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Bucket, s3Client, assertValidR2Key } from '@/lib/r2';

export const runtime = 'nodejs';

interface DeleteBody {
  key?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DeleteBody;
    const key = body.key?.trim();
    console.log('[R2 Delete] 请求参数', { key });

    if (!key) {
      return NextResponse.json({ error: 'Missing object key' }, { status: 400 });
    }

    assertValidR2Key(key);

    const command = new DeleteObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    });

    await s3Client.send(command);

    console.log('[R2 Delete] 删除成功', { key });
    // TODO: add authentication/authorization before enabling in production.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete R2 object', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to delete object' }, { status: 500 });
  }
}
