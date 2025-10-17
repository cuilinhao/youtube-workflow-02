import path from 'node:path';
import { promises as fs } from 'node:fs';
import { computeFingerprint } from './fingerprint';

export type DownloadOptions = {
  baseDir: string;
  taskId: string;
  input: { prompt: string; imageUrl?: string };
  url: string;
};

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function buildVideoFilename(taskId: string, fingerprint: string, url: string): string {
  const parsed = new URL(url);
  const baseName = path.basename(parsed.pathname || 'video.mp4');
  const ext = baseName.toLowerCase().endsWith('.mp4') ? '' : '.mp4';
  return `${taskId}_${fingerprint.slice(0, 8)}_${baseName}${ext}`;
}

export async function downloadVideoFile(opts: DownloadOptions): Promise<{ localPath: string; actualFilename: string }> {
  const fingerprint = computeFingerprint({
    prompt: opts.input.prompt,
    imageUrl: opts.input.imageUrl,
  });
  const filename = buildVideoFilename(opts.taskId, fingerprint, opts.url);
  const targetDir = path.join(opts.baseDir, new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  await ensureDir(targetDir);
  const finalPath = path.join(targetDir, filename);
  const response = await fetch(opts.url);
  if (!response.ok) {
    throw new Error(`下载视频失败: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(finalPath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), finalPath);
  return {
    localPath: path.posix.join(...relative.split(path.sep)),
    actualFilename: filename,
  };
}
