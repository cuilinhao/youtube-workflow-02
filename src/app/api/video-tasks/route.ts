import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { VideoTask } from '@/lib/types';

export const runtime = 'nodejs';

interface IncomingVideoTask {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string;
  watermark?: string;
  callbackUrl?: string;
  seeds?: string;
  enableFallback?: boolean;
  enableTranslation?: boolean;
  number?: string;
}

function nextVideoNumber(existing: VideoTask[]): string {
  const numericValues = existing
    .map((task) => Number.parseInt(task.number, 10))
    .filter((value) => Number.isFinite(value));
  const next = numericValues.length ? Math.max(...numericValues) + 1 : existing.length + 1;
  return String(next);
}

export async function GET() {
  const data = await readAppData();
  return NextResponse.json({ videoTasks: data.videoTasks });
}

export async function POST(request: Request) {
  const { task } = (await request.json()) as { task?: IncomingVideoTask };
  if (!task?.prompt?.trim()) {
    return NextResponse.json({ success: false, message: '视频提示词不能为空' }, { status: 400 });
  }

  const data = await readAppData();
  const now = new Date().toISOString();

  const number = task.number?.trim() && !data.videoTasks.some((item) => item.number === task.number)
    ? task.number.trim()
    : nextVideoNumber(data.videoTasks);

  const entry: VideoTask = {
    number,
    prompt: task.prompt.trim(),
    imageUrls: task.imageUrls ?? [],
    aspectRatio: task.aspectRatio ?? data.videoSettings.defaultAspectRatio ?? '9:16',
    watermark: task.watermark ?? '',
    callbackUrl: task.callbackUrl ?? '',
    seeds: task.seeds ?? '',
    enableFallback: task.enableFallback ?? data.videoSettings.enableFallback ?? false,
    enableTranslation: task.enableTranslation ?? data.videoSettings.enableTranslation ?? true,
    status: '等待中',
    progress: 0,
    createdAt: now,
    workflow: 'A',
    attempts: 0,
    maxAttempts: data.apiSettings.retryCount ?? 3,
  };

  data.videoTasks.push(entry);
  await writeAppData(data);

  return NextResponse.json({ success: true, task: entry });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? 'all';
  const data = await readAppData();

  if (scope === 'all') {
    data.videoTasks = [];
  }

  await writeAppData(data);

  return NextResponse.json({ success: true });
}
