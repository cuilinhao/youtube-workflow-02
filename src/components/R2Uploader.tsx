'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ListedObject {
  key: string;
  size: number;
  lastModified: string | null;
}

interface UploadResult {
  key: string;
  publicUrl?: string | null;
  readUrl?: string | null;
}

const REQUIRED_PREFIX = 'uploads/';

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

async function createReadUrl(key: string): Promise<string | null> {
  console.log('[R2Uploader] 请求临时读取链接', { key });
  const response = await fetch(`/api/r2/presign-get?key=${encodeURIComponent(key)}`);
  if (!response.ok) {
    console.error('[R2Uploader] 获取读取链接失败', { key, status: response.status });
    return null;
  }
  const data = (await response.json()) as { url?: string };
  console.log('[R2Uploader] 获取读取链接成功', { key, url: data.url });
  return data.url ?? null;
}

export function R2Uploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [objects, setObjects] = useState<ListedObject[]>([]);
  const [isListing, setIsListing] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    console.log('[R2Uploader] 选择文件', nextFile ? { name: nextFile.name, size: nextFile.size, type: nextFile.type } : '无');
    setFile(nextFile);
    setResult(null);
    setProgress(0);
  };

  const fetchUploads = async () => {
    try {
      setIsListing(true);
      console.log('[R2Uploader] 列举对象请求开始');
      const response = await fetch('/api/r2/list?prefix=uploads/&limit=20');
      if (!response.ok) {
        throw new Error(`List request failed (${response.status})`);
      }
      const data = (await response.json()) as { objects: ListedObject[] };
      console.log('[R2Uploader] 列举对象成功', data);
      setObjects(data.objects ?? []);
    } catch (error) {
      console.error('[R2Uploader] 列举对象异常', error);
      toast.error((error as Error).message || '无法获取文件列表');
    } finally {
      setIsListing(false);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      setIsDeleting(key);
      console.log('[R2Uploader] 删除对象请求开始', { key });
      const response = await fetch('/api/r2/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!response.ok) {
        throw new Error(`删除失败 (${response.status})`);
      }
      console.log('[R2Uploader] 删除对象成功', { key });
      toast.success('已删除对象');
      await fetchUploads();
    } catch (error) {
      console.error('[R2Uploader] 删除对象异常', error);
      toast.error((error as Error).message || '删除失败');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('请选择要上传的文件');
      return;
    }

    const key = `${REQUIRED_PREFIX}${Date.now()}-${sanitizeFileName(file.name) || 'file'}`;
    const contentType = file.type || 'application/octet-stream';

    try {
      setIsUploading(true);
      setProgress(0);
      console.log('[R2Uploader] 开始上传流程', { key, contentType, size: file.size });

      const presignResponse = await fetch('/api/r2/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, contentType }),
      });

      if (!presignResponse.ok) {
        const message = await presignResponse.text();
        console.error('[R2Uploader] 预签名失败', { status: presignResponse.status, message });
        throw new Error(message || '预签名失败');
      }

      const presignData = (await presignResponse.json()) as { url: string; key: string; publicUrl?: string | null };
      console.log('[R2Uploader] 预签名成功', presignData);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        console.log('[R2Uploader] XHR 初始化', { method: 'PUT', url: presignData.url });
        xhr.open('PUT', presignData.url, true);
        xhr.withCredentials = false;
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const nextProgress = Math.round((event.loaded / event.total) * 100);
            console.log('[R2Uploader] 上传进度', {
              loaded: event.loaded,
              total: event.total,
              progress: nextProgress,
            });
            setProgress(nextProgress);
          } else {
            console.log('[R2Uploader] 上传进度（不可计算）', { loaded: event.loaded, total: event.total });
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
            console.log('[R2Uploader] 已收到响应头', { status: xhr.status, statusText: xhr.statusText });
          }
        };

        xhr.onload = () => {
          console.log('[R2Uploader] XHR onload', {
            status: xhr.status,
            response: xhr.response ? xhr.response.slice(0, 200) : null,
          });
          if (xhr.status === 200 || xhr.status === 204) {
            setProgress(100);
            resolve();
          } else {
            reject(new Error(`上传失败 (HTTP ${xhr.status})`));
          }
        };

        xhr.onerror = () => {
          console.error('[R2Uploader] XHR onerror', {
            status: xhr.status,
            readyState: xhr.readyState,
            response: xhr.response ? xhr.response.slice(0, 200) : null,
          });
          reject(new Error('上传过程中发生错误'));
        };

        xhr.ontimeout = () => {
          console.error('[R2Uploader] XHR 超时', { timeout: xhr.timeout });
          reject(new Error('上传超时'));
        };

        xhr.send(file);
      });

      let readUrl = presignData.publicUrl ?? null;
      if (!readUrl) {
        readUrl = await createReadUrl(presignData.key);
      }

      const uploadResult = { key: presignData.key, publicUrl: presignData.publicUrl, readUrl };
      console.log('[R2Uploader] 上传完成', uploadResult);
      setResult(uploadResult);
      toast.success('上传成功');
      setFile(null);
      await fetchUploads();
    } catch (error) {
      console.error('[R2Uploader] 上传流程异常', error);
      toast.error((error as Error).message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Cloudflare R2 测试上传</CardTitle>
        <CardDescription>
          通过预签名 URL 直传至 R2，支持上传进度、读取链接与列举删除示例。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Input type="file" onChange={handleFileChange} accept="image/*,video/*" disabled={isUploading} />
          <div className="flex items-center gap-3">
            <Button onClick={handleUpload} disabled={!file || isUploading}>
              {isUploading ? '上传中...' : '上传文件'}
            </Button>
            <Button variant="outline" onClick={fetchUploads} disabled={isListing}>
              {isListing ? '刷新中...' : '刷新列表'}
            </Button>
          </div>
          {isUploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-muted-foreground">{progress}%</div>
            </div>
          )}
        </div>

        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <div className="font-medium">上传完成</div>
            <div className="mt-2 break-all">Key：{result.key}</div>
            {result.publicUrl ? (
              <div className="mt-2">
                公共地址：
                <a href={result.publicUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {result.publicUrl}
                </a>
              </div>
            ) : result.readUrl ? (
              <div className="mt-2">
                临时读取链接：
                <a href={result.readUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {result.readUrl}
                </a>
              </div>
            ) : (
              <div className="mt-2">无可用读取链接，需调用 GET 预签名接口。</div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-700">最近文件</div>
          <ScrollArea className="h-48 rounded border border-slate-200">
            <div className="divide-y">
              {objects.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">暂无对象，点击“刷新列表”查看。</div>
              ) : (
                objects.map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4 p-4 text-sm">
                    <div className="space-y-1">
                      <div className="font-medium break-words">{item.key}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(item.size)} · {formatDate(item.lastModified)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 text-xs">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = await createReadUrl(item.key);
                          if (url) {
                            window.open(url, '_blank', 'noopener');
                          } else {
                            toast.error('无法生成读取链接');
                          }
                        }}
                      >
                        获取临时链接
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isDeleting === item.key}
                        onClick={() => handleDelete(item.key)}
                      >
                        {isDeleting === item.key ? '删除中...' : '删除'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">
            删除接口仅作演示，生产环境请接入鉴权并限制删除范围。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
