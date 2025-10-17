import { NextResponse } from 'next/server';
import { orchestrateGenerateImages } from '@/lib/images/orchestrator';
import type { ImageJob, ShotPrompt } from '@/lib/types';

export const runtime = 'nodejs';

interface BatchRequestBody {
  shots: Array<ShotPrompt & { prompt?: string }>;
  aspectRatio?: string;
}

function normalizePrompt(shot: ShotPrompt & { prompt?: string }) {
  return shot.prompt ?? shot.image_prompt ?? '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchRequestBody;
    const shots = body?.shots ?? [];

    if (!Array.isArray(shots) || shots.length === 0) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          failed: [],
          images: [],
          message: '分镜数据不能为空',
          error: { code: 'E_EMPTY_INPUT', hint: '分镜数据不能为空', retryable: false },
        },
        { status: 400 },
      );
    }

    if (body.aspectRatio && body.aspectRatio !== '9:16') {
      return NextResponse.json(
        {
          success: false,
          results: [],
          failed: [],
          images: [],
          message: '仅支持 9:16 比例',
          error: { code: 'E_INVALID_ASPECT_RATIO', hint: '仅支持9:16比例', retryable: false },
        },
        { status: 400 },
      );
    }

    const invalidShot = shots.find(
      (item) =>
        !item ||
        typeof item.shot_id !== 'string' ||
        !normalizePrompt(item).trim(),
    );

    if (invalidShot) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          failed: [],
          images: [],
          message: '分镜数据格式不正确',
          error: { code: 'E_INVALID_DATA', hint: '分镜数据格式不正确', retryable: false },
        },
        { status: 400 },
      );
    }

    console.info('[ImagesBatch] Starting orchestrated batch generation', {
      shotCount: shots.length,
      aspectRatio: body.aspectRatio,
    });

    const jobs: ImageJob[] = shots.map((shot) => ({
      id: shot.shot_id,
      prompt: normalizePrompt(shot),
      aspectRatio: body.aspectRatio,
      seed: shot.shot_id,
      meta: {
        source: 'images/batch',
        shotId: shot.shot_id,
      },
    }));

    const { results, failed } = await orchestrateGenerateImages(jobs);
    const images = results.filter((item) => item.ok && item.url).map((item) => item.url!) ?? [];

    return NextResponse.json({
      success: failed.length === 0,
      results,
      failed,
      images,
    });
  } catch (error) {
    console.error('[ImagesBatch] Orchestration error', error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        failed: [],
        images: [],
        message: (error as Error).message ?? '批量生成图片时发生内部错误',
        error: { code: 'E_INTERNAL_ERROR', hint: '批量生成图片时发生内部错误', retryable: true },
      },
      { status: 500 },
    );
  }
}
