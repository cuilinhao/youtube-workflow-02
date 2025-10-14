'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { FileSpreadsheet, FolderUpIcon, ImagePlus, Trash2Icon } from 'lucide-react';

export interface VideoTaskFormRow {
  id: string;
  imageUrl: string;
  prompt: string;
}

export interface VideoTaskFormValues {
  number?: string;
  rows: VideoTaskFormRow[];
  aspectRatio: string;
  watermark: string;
  callbackUrl: string;
  seeds: string;
  enableFallback: boolean;
  enableTranslation: boolean;
}

export interface VideoTaskRowPayload {
  imageUrl: string;
  prompt: string;
}

export interface VideoTaskFormSubmitPayload {
  rows: VideoTaskRowPayload[];
  aspectRatio: string;
  watermark: string;
  callbackUrl: string;
  seeds: string;
  enableFallback: boolean;
  enableTranslation: boolean;
}

interface VideoTaskFormProps {
  mode: 'create' | 'edit';
  initialValues: VideoTaskFormValues;
  onSubmit: (payload: VideoTaskFormSubmitPayload) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  disableUpload?: boolean;
}

interface ImageUploadItem {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  error?: string;
}

const ASPECT_RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3'];

function generateRowId() {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateUrl(url: string, maxLength: number = 50): string {
  if (!url || url.length <= maxLength) return url;

  // 尝试从URL中提取文件名
  const match = url.match(/\/([^/?#]+\.[^/?#]+)(?:[?#]|$)/);
  if (match && match[1]) {
    const filename = match[1];
    if (filename.length <= maxLength) {
      return `.../${filename}`;
    }
  }

  // 如果文件名也很长，就截断显示
  const start = url.slice(0, Math.floor(maxLength / 2));
  const end = url.slice(-Math.floor(maxLength / 2));
  return `${start}...${end}`;
}

export function createVideoTaskFormRow(overrides?: Partial<VideoTaskFormRow>): VideoTaskFormRow {
  return {
    id: overrides?.id ?? generateRowId(),
    imageUrl: overrides?.imageUrl ?? '',
    prompt: overrides?.prompt ?? '',
  };
}

export function createEmptyVideoTaskDraft(defaults?: Partial<VideoTaskFormValues>): VideoTaskFormValues {
  const providedRows = defaults?.rows?.length ? defaults.rows.map(createVideoTaskFormRow) : undefined;
  return {
    rows: providedRows ?? [createVideoTaskFormRow()],
    aspectRatio: defaults?.aspectRatio ?? '9:16',
    watermark: defaults?.watermark ?? '',
    callbackUrl: defaults?.callbackUrl ?? '',
    seeds: defaults?.seeds ?? '',
    enableFallback: defaults?.enableFallback ?? false,
    enableTranslation: defaults?.enableTranslation ?? true,
  };
}

function parseBulkInput(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sanitizeSegment(segment: string) {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeRelativePath(raw: string) {
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts
    .map(sanitizeSegment)
    .filter(Boolean)
    .join('/');
}

function extractFirstCsvValue(line: string): string | null {
  if (!line || !line.trim()) return null;

  let inQuotes = false;
  let buffer = '';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const isEscapedQuote = inQuotes && line[index + 1] === '"';
      if (isEscapedQuote) {
        buffer += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      break;
    }

    buffer += char;
  }

  const normalized = buffer.replace(/^\ufeff/, '').trim();
  return normalized.length ? normalized : null;
}

function parseCsvFirstColumn(content: string): string[] {
  if (!content) return [];

  const prompts = content
    .split(/\r?\n/)
    .map((line) => extractFirstCsvValue(line))
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
    .filter(Boolean);

  if (!prompts.length) return [];

  const firstValue = prompts[0].toLowerCase();
  if (firstValue === 'prompt' || firstValue === '提示词' || firstValue === 'prompt text') {
    return prompts.slice(1);
  }

  return prompts;
}

export function VideoTaskForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel,
  isSubmitting,
  disableUpload,
}: VideoTaskFormProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const singleImageInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [values, setValues] = useState<VideoTaskFormValues>(() => ({
    ...initialValues,
    rows: initialValues.rows.length ? initialValues.rows.map(createVideoTaskFormRow) : [createVideoTaskFormRow()],
  }));
  const [imageUploads, setImageUploads] = useState<ImageUploadItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    setValues({
      ...initialValues,
      rows: initialValues.rows.length ? initialValues.rows.map(createVideoTaskFormRow) : [createVideoTaskFormRow()],
    });
    setImageUploads([]);
    setIsUploadingImages(false);
    setBulkInput('');
  }, [initialValues]);

  const rows = useMemo(() => values.rows, [values.rows]);

  const updateRow = (id: string, key: 'imageUrl' | 'prompt', value: string) => {
    setValues((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  };

  const removeRow = (id: string) => {
    setValues((prev) => {
      const nextRows = prev.rows.filter((row) => row.id !== id);
      if (nextRows.length === 0) {
        return { ...prev, rows: [createVideoTaskFormRow()] };
      }
      return { ...prev, rows: nextRows };
    });
  };

  const addRowsFromUrls = (urls: string[]) => {
    setValues((prev) => {
      if (!urls.length) return prev;
      const existingUrls = new Set(prev.rows.map((row) => row.imageUrl).filter(Boolean));
      const pendingUrls = urls.filter((url) => !existingUrls.has(url));
      if (!pendingUrls.length) return prev;

      const nextRows = [...prev.rows];
      pendingUrls.forEach((url) => {
        const targetIndex = nextRows.findIndex((row) => !row.imageUrl.trim());
        if (targetIndex !== -1) {
          nextRows[targetIndex] = { ...nextRows[targetIndex], imageUrl: url };
        } else {
          nextRows.push(createVideoTaskFormRow({ imageUrl: url }));
        }
      });

      return { ...prev, rows: nextRows };
    });
  };

  const applyPromptsToRows = (prompts: string[]) => {
    setValues((prev) => {
      if (!prompts.length) return prev;

      const nextRows = [...prev.rows];
      let index = 0;

      for (; index < nextRows.length && index < prompts.length; index += 1) {
        nextRows[index] = { ...nextRows[index], prompt: prompts[index] };
      }

      for (; index < prompts.length; index += 1) {
        nextRows.push(createVideoTaskFormRow({ prompt: prompts[index] }));
      }

      return { ...prev, rows: nextRows };
    });
  };

  const uploadFileToR2 = async (
    file: File,
    batchPrefix: string,
    onProgress: (value: number) => void,
  ): Promise<{ key: string; publicUrl?: string | null; readUrl?: string | null }> => {
    const contentType = file.type || 'application/octet-stream';
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
    const trimmed = relative.includes('/') ? relative.split('/').slice(1).join('/') : relative;
    const sanitized = sanitizeRelativePath(trimmed || file.name) || sanitizeSegment(file.name) || 'image';
    const key = `${batchPrefix}/${sanitized}`;

    console.log('[VideoTaskForm] 预签名请求', { key, contentType, size: file.size });
    const presignResponse = await fetch('/api/r2/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, contentType }),
    });

    if (!presignResponse.ok) {
      const message = await presignResponse.text();
      throw new Error(message || '获取预签名链接失败');
    }

    const presignData = (await presignResponse.json()) as {
      url: string;
      key: string;
      publicUrl?: string | null;
    };
    console.log('[VideoTaskForm] 预签名成功', presignData);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignData.url, true);
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 204) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`上传失败 (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('上传过程中发生错误'));
      };

      xhr.ontimeout = () => {
        reject(new Error('上传超时'));
      };

      xhr.send(file);
    });

    let readUrl = presignData.publicUrl ?? null;
    if (!readUrl) {
      const readResponse = await fetch(`/api/r2/presign-get?key=${encodeURIComponent(presignData.key)}`);
      if (readResponse.ok) {
        const readData = (await readResponse.json()) as { url?: string };
        readUrl = readData.url ?? null;
      }
    }

    console.log('[VideoTaskForm] 单文件上传完成', { key: presignData.key, readUrl, publicUrl: presignData.publicUrl });
    return { key: presignData.key, publicUrl: presignData.publicUrl, readUrl };
  };

  const uploadImagesFromFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      toast.error('所选文件夹内没有图片文件');
      return;
    }

    const batchPrefix = `uploads/video-references/${Date.now()}`;
    const batchId = Date.now();
    const initialStates = imageFiles.map((file, index) => ({
      id: `${batchId}-${index}`,
      name: file.name,
      progress: 0,
      status: 'pending' as const,
    }));
    setImageUploads(initialStates);
    setIsUploadingImages(true);

    const collectedUrls: string[] = [];

    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index];
      const itemId = initialStates[index].id;
      setImageUploads((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, status: 'uploading', progress: 0 } : item)),
      );

      try {
        const result = await uploadFileToR2(file, batchPrefix, (progress) => {
          setImageUploads((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, progress } : item)),
          );
        });

        const finalUrl = result.publicUrl ?? result.readUrl;
        setImageUploads((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'success',
                  progress: 100,
                  url: finalUrl ?? undefined,
                }
              : item,
          ),
        );

        if (finalUrl) {
          collectedUrls.push(finalUrl);
        }
      } catch (error) {
        const message = (error as Error).message || '上传失败';
        console.error('[VideoTaskForm] 上传失败', { file: file.name, message });
        setImageUploads((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'error',
                  error: message,
                }
              : item,
          ),
        );
        toast.error(`${file.name}: ${message}`);
      }
    }

    if (collectedUrls.length) {
      addRowsFromUrls(collectedUrls);
      toast.success(`已添加 ${collectedUrls.length} 张参考图`);
    }

    setIsUploadingImages(false);
  };

  const handleFolderButtonClick = () => {
    folderInputRef.current?.click();
  };

  const handleFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!fileList.length) return;
    void uploadImagesFromFiles(fileList);
  };

  const handleSingleImageButtonClick = () => {
    singleImageInputRef.current?.click();
  };

  const handleSingleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!fileList.length) return;
    void uploadImagesFromFiles(fileList);
  };

  const handleCsvButtonClick = () => {
    csvInputRef.current?.click();
  };

  const handleCsvChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const prompts = parseCsvFirstColumn(text);

      if (!prompts.length) {
        toast.error('CSV 第一列未解析到有效提示词');
        return;
      }

      applyPromptsToRows(prompts);
      toast.success(`已从 CSV 添加 ${prompts.length} 条提示词`);
    } catch (error) {
      const message = (error as Error).message || '解析 CSV 文件失败';
      toast.error(message);
    }
  };

  const handleBulkAdd = () => {
    const parsed = parseBulkInput(bulkInput);
    if (!parsed.length) {
      toast.info('请输入至少一个图片路径');
      return;
    }
    addRowsFromUrls(parsed);
    setBulkInput('');
    toast.success(`已添加 ${parsed.length} 条路径`);
  };

  const handleSubmit = () => {
    const trimmedRows = rows
      .map((row) => ({
        id: row.id,
        imageUrl: row.imageUrl.trim(),
        prompt: row.prompt.trim(),
      }))
      .filter((row) => row.imageUrl || row.prompt);

    if (!trimmedRows.length) {
      toast.error('请添加至少一行图片与提示词');
      return;
    }

    const hasEmptyImage = trimmedRows.some((row) => !row.imageUrl);
    if (hasEmptyImage) {
      toast.error('图片路径不能为空');
      return;
    }

    const someHavePrompts = trimmedRows.some((row) => row.prompt);

    if (!someHavePrompts) {
      toast.error('请至少填写一个提示词');
      return;
    }

    // 如果有部分行没有提示词，使用第一个有提示词的行作为默认值
    const defaultPrompt = trimmedRows.find((row) => row.prompt)?.prompt || '';
    const normalizedRows = trimmedRows.map((row) => ({
      ...row,
      prompt: row.prompt || defaultPrompt,
    }));

    const payload: VideoTaskFormSubmitPayload = {
      rows: normalizedRows.map((row) => ({
        imageUrl: row.imageUrl,
        prompt: row.prompt,
      })),
      aspectRatio: values.aspectRatio,
      watermark: values.watermark,
      callbackUrl: values.callbackUrl,
      seeds: values.seeds,
      enableFallback: values.enableFallback,
      enableTranslation: values.enableTranslation,
    };

    onSubmit(payload);
  };

  return (
    <div className="flex h-full flex-col">
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFolderChange}
        disabled={disableUpload}
      />
      <input
        ref={singleImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSingleImageChange}
        disabled={disableUpload}
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvChange}
        disabled={disableUpload}
      />
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-base font-semibold">参考图与提示词</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFolderButtonClick}
                  disabled={disableUpload || isUploadingImages}
                >
                  <FolderUpIcon className="mr-2 h-4 w-4" /> 上传参考图文件夹
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSingleImageButtonClick}
                  disabled={disableUpload || isUploadingImages}
                >
                  <ImagePlus className="mr-2 h-4 w-4" /> 添加单张图片
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCsvButtonClick}
                  disabled={disableUpload}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> 批量添加图生视频 CSV
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              一行对应一张参考图与提示词，支持本地路径或在线 URL。
            </p>

            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-16 text-center">序号</TableHead>
                    <TableHead className="w-[40%]">图片路径</TableHead>
                    <TableHead>提示词</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="text-center text-sm text-slate-600">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Input
                            value={row.imageUrl}
                            placeholder="/Users/linhao/xxx.png 或 https://example.com/a.png"
                            onChange={(event) => updateRow(row.id, 'imageUrl', event.target.value)}
                          />
                          {row.imageUrl && (
                            <div className="text-xs text-slate-500 truncate" title={row.imageUrl}>
                              {truncateUrl(row.imageUrl, 60)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            value={row.prompt}
                            placeholder="请输入该图片对应的提示词"
                            rows={3}
                            onChange={(event) => updateRow(row.id, 'prompt', event.target.value)}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={() => removeRow(row.id)}
                              disabled={rows.length === 1}
                            >
                              <Trash2Icon className="mr-2 h-4 w-4" /> 删除行
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Textarea
                value={bulkInput}
                onChange={(event) => setBulkInput(event.target.value)}
                placeholder="批量粘贴图片路径，每行一条。"
                rows={3}
              />
              <div className="flex items-start gap-2 md:flex-col">
                <Button type="button" variant="secondary" onClick={handleBulkAdd} className="md:w-full">
                  批量添加
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setBulkInput('')}
                  className="text-slate-500 hover:text-slate-700 md:w-full"
                >
                  清空输入
                </Button>
              </div>
            </div>
          </div>

          {imageUploads.length > 0 && (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">上传进度</p>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {imageUploads.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 truncate max-w-[240px]" title={item.name}>
                        {item.name}
                      </span>
                      <span
                        className={cn(
                          'whitespace-nowrap rounded px-1.5 py-0.5 font-medium',
                          item.status === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'error'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-sky-100 text-sky-700',
                        )}
                      >
                        {item.status === 'success' ? '成功' : item.status === 'error' ? '失败' : '上传中'}
                      </span>
                    </div>
                    <Progress value={item.progress} className="h-1.5" />
                    {item.url ? (
                      <div className="text-xs" title={item.url}>
                        <span className="text-slate-500">
                          {truncateUrl(item.url, 60)}
                        </span>
                      </div>
                    ) : null}
                    {item.error ? <p className="text-xs text-rose-600">{item.error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>画幅比例</Label>
              <Select
                value={values.aspectRatio}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    aspectRatio: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择画幅" />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIO_OPTIONS.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-watermark">水印（可选）</Label>
              <Input
                id="video-watermark"
                value={values.watermark}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    watermark: event.target.value,
                  }))
                }
                placeholder="例如：MyBrand"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-callback">回调地址（可选）</Label>
              <Input
                id="video-callback"
                value={values.callbackUrl}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    callbackUrl: event.target.value,
                  }))
                }
                placeholder="https://your-domain.com/callback"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-seeds">随机种子（可选）</Label>
              <Input
                id="video-seeds"
                value={values.seeds}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    seeds: event.target.value,
                  }))
                }
                placeholder="例如：12345"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="video-fallback"
                checked={values.enableFallback}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({
                    ...prev,
                    enableFallback: Boolean(checked),
                  }))
                }
              />
              <Label htmlFor="video-fallback" className="text-sm text-muted-foreground">
                启用备用模型 (enableFallback)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="video-translation"
                checked={values.enableTranslation}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({
                    ...prev,
                    enableTranslation: Boolean(checked),
                  }))
                }
              />
              <Label htmlFor="video-translation" className="text-sm text-muted-foreground">
                启用提示词翻译 (enableTranslation)
              </Label>
            </div>
          </div>
        </div>
      </ScrollArea>
      <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {cancelLabel ?? '取消'}
          </Button>
        ) : null}
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? '提交中...' : submitLabel ?? (mode === 'edit' ? '更新任务' : '保存任务')}
        </Button>
      </div>
    </div>
  );
}
