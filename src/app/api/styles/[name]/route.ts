import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { StyleEntry } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: { name: string } },
) {
  const name = decodeURIComponent(params.name);
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
  _request: Request,
  { params }: { params: { name: string } },
) {
  const name = decodeURIComponent(params.name);
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
