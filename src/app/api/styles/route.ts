import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { StyleEntry } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET() {
  const data = await readAppData();
  return NextResponse.json({
    styles: Object.values(data.styleLibrary),
    currentStyle: data.currentStyle,
    customStyleContent: data.customStyleContent,
  });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<StyleEntry> & { name: string };
  const name = payload.name?.trim();
  if (!name || !payload.content?.trim()) {
    return NextResponse.json({ success: false, message: '风格名称和内容不能为空' }, { status: 400 });
  }

  const data = await readAppData();
  const now = new Date().toISOString();
  const existing = data.styleLibrary[name];

  const entry: StyleEntry = {
    name,
    content: payload.content.trim(),
    category: payload.category?.trim() || existing?.category || '自定义',
    createdTime: existing?.createdTime ?? now,
    usageCount: existing?.usageCount ?? 0,
  };

  data.styleLibrary[name] = entry;
  if (!data.currentStyle) {
    data.currentStyle = name;
    data.customStyleContent = entry.content;
  }

  await writeAppData(data);
  return NextResponse.json({ success: true, style: entry });
}
