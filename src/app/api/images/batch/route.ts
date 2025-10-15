import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { BatchImagesResponse, ApiError, ShotPrompt, GeneratedImage, FailedItem } from '@/lib/types';
import { validateGeneratedImages } from '@/lib/schema-validation';

const MAX_CONCURRENCY = 4;
const MAX_RETRIES = 3;
const FETCH_TIMEOUT = 90_000;
const WIDTH = 1080;
const HEIGHT = 1920;
const IMAGE_BASE_URL = 'https://image.pollinations.ai/prompt';

interface ProcessResult {
  image?: GeneratedImage;
  failed?: FailedItem;
}

function buildOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const host = request.headers.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

function sanitizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const ensureDir = (pathname: string) => fs.mkdir(pathname, { recursive: true });

async function fetchImage(prompt: ShotPrompt, signal: AbortSignal): Promise<Buffer> {
  const encoded = encodeURIComponent(sanitizePrompt(prompt.image_prompt));
  const url = `${IMAGE_BASE_URL}/${encoded}?width=${WIDTH}&height=${HEIGHT}&seed=${encodeURIComponent(prompt.shot_id)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'image/jpeg',
      'User-Agent': 'video-workflow/1.0',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`图片生成接口响应 ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error('图片生成接口返回空数据');
  }

  return buffer;
}

async function processShot(options: {
  shot: ShotPrompt;
  origin: string;
  outputDir: string;
}): Promise<ProcessResult> {
  const { shot, origin, outputDir } = options;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const raw = await fetchImage(shot, controller.signal);
      const processed = await sharp(raw)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 90 })
        .toBuffer();

      await ensureDir(outputDir);
      const filename = `${shot.shot_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const filepath = join(outputDir, filename);
      await fs.writeFile(filepath, processed);

      const imageUrl = `${origin}/generated/${filename}`;
      return {
        image: {
          shot_id: shot.shot_id,
          url: imageUrl,
          source: 'generated',
        },
      };
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        break;
      }

      const wait = Math.min(200 * Math.pow(1.6, attempt - 1), 5000);
      await delay(wait);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    failed: {
      shot_id: shot.shot_id,
      reason: lastError instanceof Error ? lastError.message : '未知错误',
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const { shots, aspectRatio } = await request.json();

    if (!shots || !Array.isArray(shots) || shots.length === 0) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '分镜数据不能为空',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    if (aspectRatio !== '9:16') {
      const error: ApiError = {
        code: 'E_INVALID_ASPECT_RATIO',
        hint: '仅支持9:16比例',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const invalidShot = shots.find(
      (item: ShotPrompt) =>
        !item ||
        typeof item.shot_id !== 'string' ||
        typeof item.image_prompt !== 'string' ||
        item.shot_id.trim().length === 0 ||
        item.image_prompt.trim().length === 0,
    );

    if (invalidShot) {
      const error: ApiError = {
        code: 'E_INVALID_DATA',
        hint: '分镜数据格式不正确',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const origin = buildOrigin(request);
    const outputDir = join(process.cwd(), 'public', 'generated');
    const limit = pLimit(MAX_CONCURRENCY);
    const tasks = (shots as ShotPrompt[]).map((shot) =>
      limit(() => processShot({ shot, origin, outputDir })),
    );

    const results = await Promise.all(tasks);
    const images: GeneratedImage[] = [];
    const failed: FailedItem[] = [];

    for (const result of results) {
      if (result.image) {
        images.push(result.image);
      }
      if (result.failed) {
        failed.push(result.failed);
      }
    }

    const urlSet = new Set<string>();
    const duplicate = images.find((image) => {
      if (urlSet.has(image.url)) {
        return true;
      }
      urlSet.add(image.url);
      return false;
    });

    if (duplicate) {
      const error: ApiError = {
        code: 'E_DUPLICATE_URL',
        hint: `检测到重复的图片URL: ${duplicate.url}`,
        retryable: true,
        failed,
      };
      return NextResponse.json(error, { status: 409 });
    }

    const validation = validateGeneratedImages(images);
    if (!validation.valid) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: `Schema验证失败: ${validation.errors.join(', ')}`,
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const response: BatchImagesResponse = { images };
    if (failed.length > 0) {
      response.failed = failed;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Batch image generation error:', error);

    const apiError: ApiError = {
      code: 'E_INTERNAL_ERROR',
      hint: '批量生成图片时发生内部错误',
      retryable: true,
    };

    return NextResponse.json(apiError, { status: 500 });
  }
}
