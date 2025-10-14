import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { ImageReference } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: { category: string } },
) {
  const { category } = params;
  const oldName = decodeURIComponent(category);
  const { name: newNameRaw } = (await request.json()) as { name?: string };
  const newName = newNameRaw?.trim();

  if (!newName) {
    return NextResponse.json({ success: false, message: '新名称不能为空' }, { status: 400 });
  }

  const data = await readAppData();
  if (!data.categoryLinks[oldName]) {
    return NextResponse.json({ success: false, message: '分类不存在' }, { status: 404 });
  }

  if (data.categoryLinks[newName] && newName !== oldName) {
    return NextResponse.json({ success: false, message: '新分类名称已存在' }, { status: 409 });
  }

  const images = data.categoryLinks[oldName];
  if (newName !== oldName) {
    data.categoryLinks[newName] = images.map((img) => {
      const updated: ImageReference = { ...img };
      if (updated.path?.startsWith(`images/${oldName}/`)) {
        updated.path = updated.path.replace(`images/${oldName}/`, `images/${newName}/`);
      }
      updated.updatedAt = new Date().toISOString();
      return updated;
    });
    delete data.categoryLinks[oldName];

    const oldDir = path.join(process.cwd(), 'public', 'images', oldName);
    const newDir = path.join(process.cwd(), 'public', 'images', newName);
    await fs.mkdir(path.dirname(newDir), { recursive: true });
    try {
      await fs.rename(oldDir, newDir);
    } catch (error) {
      console.warn('重命名分类目录失败', error);
    }
  }

  await writeAppData(data);

  return NextResponse.json({ success: true, category: newName });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { category: string } },
) {
  const { category } = params;
  const decoded = decodeURIComponent(category);

  const data = await readAppData();
  if (!data.categoryLinks[decoded]) {
    return NextResponse.json({ success: false, message: '分类不存在' }, { status: 404 });
  }

  const images = data.categoryLinks[decoded];
  for (const image of images) {
    if (image.path) {
      const filePath = path.join(process.cwd(), 'public', image.path);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn('删除图片文件失败', error);
      }
    }
  }

  delete data.categoryLinks[decoded];
  await writeAppData(data);

  const dirPath = path.join(process.cwd(), 'public', 'images', decoded);
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('删除分类目录失败', error);
  }

  return NextResponse.json({ success: true });
}
