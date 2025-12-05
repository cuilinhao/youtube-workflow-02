import { NextResponse, type NextRequest } from 'next/server';
import { updateAppData } from '@/lib/data-store';
import type { VideoTask } from '@/lib/types';

export const runtime = 'nodejs';

type RouteParams = Promise<Record<string, string | string[] | undefined>>;

async function resolveNumber(params: RouteParams) {
  const resolved = await params;
  const value = resolved?.number;
  return Array.isArray(value) ? value[0] : value;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawNumber = await resolveNumber(params);
  if (!rawNumber) {
    return NextResponse.json({ success: false, message: '视频任务编号缺失' }, { status: 400 });
  }

  const number = decodeURIComponent(rawNumber);
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
  _request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawNumber = await resolveNumber(params);
  if (!rawNumber) {
    return NextResponse.json({ success: false, message: '视频任务编号缺失' }, { status: 400 });
  }

  const number = decodeURIComponent(rawNumber);
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
