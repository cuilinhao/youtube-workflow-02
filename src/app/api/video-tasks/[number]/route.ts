import { NextResponse } from 'next/server';
import { updateAppData } from '@/lib/data-store';
import type { VideoTask } from '@/lib/types';

export const runtime = 'nodejs';

type RouteContext =
  | { params: { number: string } }
  | { params: Promise<{ number: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const { number: encodedNumber } = await Promise.resolve(context.params);
  const number = decodeURIComponent(encodedNumber);
  const payload = (await request.json()) as Partial<VideoTask>;
  if (payload.number && payload.number !== number) {
    delete payload.number;
  }

  let updatedTask: VideoTask | undefined;

  await updateAppData((draft) => {
    const task = draft.videoTasks.find((item) => item.number === number);
    if (!task) {
      return draft;
    }
    Object.assign(task, payload, { updatedAt: new Date().toISOString() });
    updatedTask = { ...task };
    return draft;
  });

  if (!updatedTask) {
    return NextResponse.json({ success: false, message: '视频任务不存在' }, { status: 404 });
  }

  return NextResponse.json({ success: true, task: updatedTask });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  const { number: encodedNumber } = await Promise.resolve(context.params);
  const number = decodeURIComponent(encodedNumber);
  let removed = false;
  await updateAppData((draft) => {
    const index = draft.videoTasks.findIndex((item) => item.number === number);
    if (index < 0) {
      return draft;
    }
    draft.videoTasks.splice(index, 1);
    removed = true;
    return draft;
  });

  if (!removed) {
    return NextResponse.json({ success: false, message: '视频任务不存在' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
