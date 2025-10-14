import { NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Bucket, s3Client } from '@/lib/r2';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix') ?? undefined;
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor') ?? undefined;
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : DEFAULT_LIMIT;
    const maxKeys = Math.min(Math.max(parsedLimit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    console.log('[R2 List] 请求参数', { prefix, maxKeys, cursor });

    const command = new ListObjectsV2Command({
      Bucket: r2Bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: cursor,
    });

    const response = await s3Client.send(command);

    const objects = (response.Contents ?? [])
      .filter((item) => Boolean(item.Key))
      .map((item) => ({
        key: item.Key as string,
        size: item.Size ?? 0,
        lastModified: item.LastModified?.toISOString() ?? null,
      }));

    const payload = {
      objects,
      nextCursor: response.NextContinuationToken ?? null,
    };

    console.log('[R2 List] 返回数据', payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to list R2 objects', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to list objects' },
      { status: 500 },
    );
  }
}
