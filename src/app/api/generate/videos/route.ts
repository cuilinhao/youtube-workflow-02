import { NextResponse } from 'next/server';
import { generateVideos } from '@/lib/video-generation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = new Date();
  try {
    const body = (await request.json().catch(() => ({}))) as { numbers?: string[] };
    console.log('\n[视频生成API] ===============================================================');
    console.log('[视频生成API] 收到请求', {
      startedAt: startedAt.toISOString(),
      method: request.method,
      numbers: body.numbers,
      userAgent: request.headers.get('user-agent') ?? 'unknown',
      referer: request.headers.get('referer') ?? 'unknown',
    });
    const result = await generateVideos({ numbers: body.numbers });
    console.log('[视频生成API] 响应结果', {
      durationMs: Date.now() - startedAt.getTime(),
      result,
    });
    console.log('[视频生成API] ===============================================================\n');
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[视频生成API] ❌ 处理失败', {
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return NextResponse.json(
      { success: false, message: (error as Error).message || '生成视频失败' },
      { status: 500 },
    );
  }
}
