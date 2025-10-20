import { NextResponse } from 'next/server';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

const execFileAsync = promisify(execFile);

async function ensureDirectory(target: string): Promise<string> {
  if (!target || typeof target !== 'string') {
    throw new Error('未提供有效的路径');
  }

  const normalized = target.trim();
  if (!normalized) {
    throw new Error('未提供有效的路径');
  }

  const publicDir = path.join(process.cwd(), 'public');
  const resolved = path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.resolve(publicDir, normalized);

  const stats = await fs.stat(resolved).catch(() => {
    throw new Error('指定的文件或文件夹不存在');
  });

  return stats.isDirectory() ? resolved : path.dirname(resolved);
}

async function openDirectory(dir: string) {
  const platform = os.platform();

  if (platform === 'darwin') {
    await execFileAsync('open', [dir]);
    return;
  }

  if (platform === 'win32') {
    await execFileAsync('explorer.exe', [dir]);
    return;
  }

  await execFileAsync('xdg-open', [dir]);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { path?: string };
    if (!body.path) {
      return NextResponse.json({ success: false, message: '缺少路径参数' }, { status: 400 });
    }

    const directory = await ensureDirectory(body.path);
    await openDirectory(directory);

    return NextResponse.json({ success: true, directory }, { status: 200 });
  } catch (error) {
    const message = (error as Error).message || '打开文件夹失败';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

