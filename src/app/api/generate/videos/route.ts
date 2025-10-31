import '@/server-init';
import { NextResponse } from 'next/server';
import { generateVideos } from '@/lib/video-generation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = new Date();
  try {
    const body = (await request.json().catch(() => ({}))) as { numbers?: string[]; provider?: string };
    console.log('\n[视频生成API] ===============================================================');
    console.log('[视频生成API] 收到请求', {
      startedAt: startedAt.toISOString(),
      method: request.method,
      numbers: body.numbers,
      provider: body.provider,
      userAgent: request.headers.get('user-agent') ?? 'unknown',
      referer: request.headers.get('referer') ?? 'unknown',
    });
    const result = await generateVideos({ numbers: body.numbers, provider: body.provider });
    if (!result.success && Array.isArray(result.failed) && result.failed.length) {
      // 单独输出失败任务的编号与失败原因，便于快速排查。
      for (const item of result.failed) {
        console.warn('[视频生成API] 失败任务详情', {
          number: item?.number ?? 'unknown',
          status: item?.status ?? 'unknown',
          error: item?.error ?? '未知错误',
        });
      }
    } else if (result.success) {
      const succeeded = Array.isArray(result.succeeded) ? result.succeeded : [];
      // 成功时打印生成完成的任务编号，便于快速定位成果。
      console.info('[视频生成API] 成功任务', {
        count: succeeded.length,
        numbers: succeeded,
      });
    }
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
