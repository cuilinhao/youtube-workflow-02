import { NextResponse, type NextRequest } from 'next/server';
import { readAppData, writeAppData } from '@youtube/lib/data-store';
import type { StyleEntry } from '@youtube/lib/types';

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
    return NextResponse.json({ success: false, message: '风格名称缺失' }, { status: 400 });
  }

  const name = decodeURIComponent(rawName);
  const payload = (await request.json()) as Partial<StyleEntry> & { name?: string };
  const data = await readAppData();
  const existing = data.styleLibrary[name];

  if (!existing) {
    return NextResponse.json({ success: false, message: '风格不存在' }, { status: 404 });
  }

  let targetName = name;
  if (payload.name && payload.name.trim() && payload.name.trim() !== name) {
    const newName = payload.name.trim();
    if (data.styleLibrary[newName]) {
      return NextResponse.json({ success: false, message: '风格名称已存在' }, { status: 409 });
    }
    delete data.styleLibrary[name];
    data.styleLibrary[newName] = { ...existing, name: newName };
    targetName = newName;
    if (data.currentStyle === name) {
      data.currentStyle = newName;
    }
  }

  const target = data.styleLibrary[targetName];
  if (payload.content !== undefined) target.content = payload.content;
  if (payload.category !== undefined) target.category = payload.category;
  if (payload.usageCount !== undefined) target.usageCount = payload.usageCount;

  await writeAppData(data);
  return NextResponse.json({ success: true, style: target });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: RouteParams },
) {
  const rawName = await resolveName(params);
  if (!rawName) {
    return NextResponse.json({ success: false, message: '风格名称缺失' }, { status: 400 });
  }

  const name = decodeURIComponent(rawName);
  const data = await readAppData();
  if (!data.styleLibrary[name]) {
    return NextResponse.json({ success: false, message: '风格不存在' }, { status: 404 });
  }

  delete data.styleLibrary[name];
  if (data.currentStyle === name) {
    data.currentStyle = '';
    data.customStyleContent = '';
  }

  await writeAppData(data);
  return NextResponse.json({ success: true });
}
