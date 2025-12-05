import { NextResponse, type NextRequest } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { KeyEntry } from '@/lib/types';

export const runtime = 'nodejs';
type RouteParams = Promise<Record<string, string | string[] | undefined>>;

async function resolveName(params: RouteParams) {
  const resolved = await params;
  const value = resolved?.name;
  return Array.isArray(value) ? value[0] : value;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawName = await resolveName(params);
  if (!rawName) {
    return NextResponse.json({ success: false, message: '名称参数缺失' }, { status: 400 });
  }

  const oldName = decodeURIComponent(rawName);
  const data = await readAppData();
  const existing = data.keyLibrary[oldName];

  if (!existing) {
    return NextResponse.json({ success: false, message: '密钥不存在' }, { status: 404 });
  }

  const payload = (await request.json()) as Partial<KeyEntry> & { name?: string };
  let targetName = oldName;

  if (payload.name && payload.name.trim() && payload.name.trim() !== oldName) {
    const newName = payload.name.trim();
    if (data.keyLibrary[newName]) {
      return NextResponse.json({ success: false, message: '名称已存在' }, { status: 409 });
    }
    delete data.keyLibrary[oldName];
    data.keyLibrary[newName] = { ...existing, name: newName };
    targetName = newName;
    if (data.apiSettings.currentKeyName === oldName) {
      data.apiSettings.currentKeyName = newName;
    }
  }

  const target = data.keyLibrary[targetName];
  if (payload.apiKey !== undefined) target.apiKey = payload.apiKey;
  if (payload.platform !== undefined) target.platform = payload.platform;
  if (payload.lastUsed !== undefined) target.lastUsed = payload.lastUsed;

  await writeAppData(data);
  return NextResponse.json({ success: true, key: target });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawName = await resolveName(params);
  if (!rawName) {
    return NextResponse.json({ success: false, message: '名称参数缺失' }, { status: 400 });
  }

  const name = decodeURIComponent(rawName);
  const data = await readAppData();
  if (!data.keyLibrary[name]) {
    return NextResponse.json({ success: false, message: '密钥不存在' }, { status: 404 });
  }

  delete data.keyLibrary[name];
  if (data.apiSettings.currentKeyName === name) {
    data.apiSettings.currentKeyName = '';
    data.apiSettings.apiPlatform = '云雾';
  }

  await writeAppData(data);
  return NextResponse.json({ success: true });
}
