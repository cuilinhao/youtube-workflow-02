import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { readAppData, writeAppData } from '@/lib/data-store';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: { category: string; name: string } },
) {
  const { category, name } = params;
  const decodedCategory = decodeURIComponent(category);
  const decodedName = decodeURIComponent(name);

  const data = await readAppData();
  const images = data.categoryLinks[decodedCategory];

  if (!images) {
    return NextResponse.json({ success: false, message: '分类不存在' }, { status: 404 });
  }

  const index = images.findIndex((item) => item.name === decodedName);
  if (index < 0) {
    return NextResponse.json({ success: false, message: '图片不存在' }, { status: 404 });
  }

  const [removed] = images.splice(index, 1);

  if (removed?.path) {
    const filePath = path.join(process.cwd(), 'public', removed.path);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('删除图片文件失败', error);
    }
  }

  if (!images.length) {
    delete data.categoryLinks[decodedCategory];
    const dirPath = path.join(process.cwd(), 'public', 'images', decodedCategory);
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  await writeAppData(data);

  return NextResponse.json({ success: true });
}
