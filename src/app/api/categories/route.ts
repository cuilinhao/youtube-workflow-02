import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { readAppData, writeAppData } from '@/lib/data-store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim();

  if (!trimmed) {
    return NextResponse.json({ success: false, message: '分类名称不能为空' }, { status: 400 });
  }

  const data = await readAppData();
  if (data.categoryLinks[trimmed]) {
    return NextResponse.json({ success: false, message: '分类已存在' }, { status: 409 });
  }

  data.categoryLinks[trimmed] = [];
  await writeAppData(data);

  const dirPath = path.join(process.cwd(), 'public', 'images', trimmed);
  await fs.mkdir(dirPath, { recursive: true });

  return NextResponse.json({ success: true, category: trimmed });
}
