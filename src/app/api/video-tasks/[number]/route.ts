import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { VideoTask } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: { number: string } },
) {
  const number = decodeURIComponent(params.number);
  const payload = (await request.json()) as Partial<VideoTask>;
  if (payload.number && payload.number !== number) {
    delete payload.number;
  }

  const data = await readAppData();
  const task = data.videoTasks.find((item) => item.number === number);
  if (!task) {
    return NextResponse.json({ success: false, message: '视频任务不存在' }, { status: 404 });
  }

  Object.assign(task, payload, { updatedAt: new Date().toISOString() });

  await writeAppData(data);
  return NextResponse.json({ success: true, task });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { number: string } },
) {
  const number = decodeURIComponent(params.number);
  const data = await readAppData();
  const index = data.videoTasks.findIndex((item) => item.number === number);
  if (index < 0) {
    return NextResponse.json({ success: false, message: '视频任务不存在' }, { status: 404 });
  }

  data.videoTasks.splice(index, 1);
  await writeAppData(data);

  return NextResponse.json({ success: true });
}
