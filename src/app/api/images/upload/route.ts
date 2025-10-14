import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { ImageReference } from '@/lib/types';

export const runtime = 'nodejs';

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'image';
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const category = (formData.get('category') as string | null)?.trim();
  const name = (formData.get('name') as string | null)?.trim();

  if (!file || !category || !name) {
    return NextResponse.json({ message: '缺少必要参数' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const data = await readAppData();
  const normalizedCategory = category;
  const normalizedName = name;

  if (!data.categoryLinks[normalizedCategory]) {
    data.categoryLinks[normalizedCategory] = [];
  }

  const categoryDir = path.join(process.cwd(), 'public', 'images', normalizedCategory);
  await fs.mkdir(categoryDir, { recursive: true });

  const ext = path.extname(file.name) || '.png';
  const baseName = sanitizeFilename(normalizedName);
  let finalName = `${baseName}${ext}`;
  let counter = 1;
  while (true) {
    try {
      await fs.access(path.join(categoryDir, finalName));
      const candidate = `${baseName}-${counter}${ext}`;
      counter += 1;
      finalName = candidate;
    } catch {
      break;
    }
  }

  await fs.writeFile(path.join(categoryDir, finalName), buffer);

  const relativePath = path.posix.join('images', normalizedCategory, finalName);

  const createdAt = new Date().toISOString();
  const entry: ImageReference = {
    name: normalizedName,
    path: relativePath,
    createdAt,
    updatedAt: createdAt,
  };

  const existingIndex = data.categoryLinks[normalizedCategory].findIndex((item) => item.name === normalizedName);
  if (existingIndex >= 0) {
    data.categoryLinks[normalizedCategory][existingIndex] = entry;
  } else {
    data.categoryLinks[normalizedCategory].push(entry);
  }

  await writeAppData(data);

  return NextResponse.json({
    success: true,
    image: entry,
  });
}
