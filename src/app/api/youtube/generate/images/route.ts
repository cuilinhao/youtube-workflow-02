import { NextResponse } from 'next/server';
import { prepareImageJobs } from '@youtube/lib/image-generation';
import { orchestrateGenerateImages } from '@youtube/lib/images/orchestrator';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mode?: 'new' | 'selected' | 'all'; numbers?: string[] };
    const mode = body.mode ?? 'new';
    const { jobs, message } = await prepareImageJobs({ mode, numbers: body.numbers });

    if (!jobs.length) {
      return NextResponse.json(
        { success: false, results: [], failed: [], message: message ?? '没有需要生成的提示词' },
        { status: 200 },
      );
    }

    const { results, failed, diagnostics } = await orchestrateGenerateImages(jobs);
    return NextResponse.json(
      {
        success: failed.length === 0,
        results,
        failed,
        warnings: diagnostics,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('批量出图失败', error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        failed: [],
        message: (error as Error).message || '批量出图失败',
      },
      { status: 500 },
    );
  }
}
