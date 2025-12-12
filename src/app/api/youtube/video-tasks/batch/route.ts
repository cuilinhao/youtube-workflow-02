import { NextResponse } from 'next/server';
import { updateAppData } from '@youtube/lib/data-store';
import type { VideoTask } from '@youtube/lib/types';

export const runtime = 'nodejs';

interface BatchUpdatePayload {
  numbers?: string[];
  updates?: Partial<VideoTask>;
  resetGeneration?: boolean;
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as BatchUpdatePayload;
  const numbers = Array.isArray(body.numbers) ? body.numbers.filter(Boolean) : [];
  if (!numbers.length) {
    return NextResponse.json({ success: false, message: '缺少需要更新的任务编号' }, { status: 400 });
  }

  const updates = body.updates ?? {};
  const reset = body.resetGeneration ?? false;

  const payload: Partial<VideoTask> = { ...updates };
  if (reset) {
    Object.assign(payload, {
      status: '等待中',
      progress: 0,
      remoteUrl: null,
      localPath: null,
      errorMsg: null,
      providerRequestId: null,
      actualFilename: null,
      fingerprint: null,
      finishedAt: null,
      startedAt: null,
      attempts: 0,
    } satisfies Partial<VideoTask>);
  }

  const updatedTasks: VideoTask[] = [];
  const targetSet = new Set(numbers);

  await updateAppData((draft) => {
    draft.videoTasks.forEach((task) => {
      if (!targetSet.has(task.number)) return;
      Object.assign(task, payload, { updatedAt: new Date().toISOString() });
      updatedTasks.push({ ...task });
    });
    return draft;
  });

  if (!updatedTasks.length) {
    return NextResponse.json({ success: false, message: '未找到对应的任务编号' }, { status: 404 });
  }

  return NextResponse.json({ success: true, tasks: updatedTasks });
}
