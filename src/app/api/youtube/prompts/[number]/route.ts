import { NextResponse, type NextRequest } from 'next/server';
import { readAppData, writeAppData } from '@youtube/lib/data-store';
import type { PromptEntry } from '@youtube/lib/types';

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
    return NextResponse.json({ success: false, message: '编号参数缺失' }, { status: 400 });
  }

  const number = decodeURIComponent(rawNumber);
  const payload = (await request.json()) as Partial<PromptEntry> & { prompt?: string };

  const data = await readAppData();
  const target = data.prompts.find((item) => item.number === number);

  if (!target) {
    return NextResponse.json({ success: false, message: '提示词不存在' }, { status: 404 });
  }

  if (payload.prompt && payload.prompt !== target.prompt) {
    delete data.promptNumbers[target.prompt];
    data.promptNumbers[payload.prompt] = number;
    target.prompt = payload.prompt;
  }

  if (payload.status) {
    target.status = payload.status;
  }

  if (payload.imageUrl !== undefined) {
    target.imageUrl = payload.imageUrl;
  }

  if (payload.localPath !== undefined) {
    target.localPath = payload.localPath;
  }

  if (payload.errorMsg !== undefined) {
    target.errorMsg = payload.errorMsg;
  }

  if (payload.actualFilename !== undefined) {
    target.actualFilename = payload.actualFilename;
  }

  target.updatedAt = new Date().toISOString();

  await writeAppData(data);

  return NextResponse.json({ success: true, prompt: target });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawNumber = await resolveNumber(params);
  if (!rawNumber) {
    return NextResponse.json({ success: false, message: '编号参数缺失' }, { status: 400 });
  }

  const number = decodeURIComponent(rawNumber);
  const data = await readAppData();
  const index = data.prompts.findIndex((item) => item.number === number);
  if (index < 0) {
    return NextResponse.json({ success: false, message: '提示词不存在' }, { status: 404 });
  }

  const [removed] = data.prompts.splice(index, 1);
  if (removed?.prompt) {
    delete data.promptNumbers[removed.prompt];
  }

  await writeAppData(data);
  return NextResponse.json({ success: true });
}
