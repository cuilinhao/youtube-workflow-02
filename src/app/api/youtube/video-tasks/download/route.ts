import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { number, url } = (await request.json()) as { number: string; url: string };

    if (!number || !url) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const saveDir = path.join(process.cwd(), 'public', 'generated_videos');
    await fs.mkdir(saveDir, { recursive: true });

    const parsedUrl = new URL(url);
    const baseName = path.basename(parsedUrl.pathname) || `${number}-${Date.now()}.mp4`;
    const ext = baseName.toLowerCase().endsWith('.mp4') ? '' : '.mp4';
    const timestamp = Date.now();
    const filename = `${number}_${timestamp}_${baseName}${ext}`;
    const finalPath = path.join(saveDir, filename);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(finalPath, buffer);

    const relativePath = path.relative(path.join(process.cwd(), 'public'), finalPath);
    const localPath = path.posix.join(relativePath);

    return NextResponse.json({
      success: true,
      localPath,
      filename,
    });
  } catch (error) {
    console.error('下载视频失败:', error);
    return NextResponse.json(
      { error: (error as Error).message || '下载视频失败' },
      { status: 500 },
    );
  }
}