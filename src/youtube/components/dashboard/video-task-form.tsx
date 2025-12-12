'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { cacheImageFiles, clearCachedImages, type CachedImageMetadata } from '@youtube/lib/image-cache';
import { cn } from '@youtube/lib/utils';
import { ClipboardList, FileSpreadsheet, FolderUpIcon, ImagePlus, Trash2Icon } from 'lucide-react';
import { VIDEO_ASPECT_RATIO_OPTIONS } from '@youtube/constants/video';

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
  promptOnly?: boolean; // 文生视频模式：仅需提示词，不需要图片列
}

interface ImageUploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  error?: string;
  cacheKey?: string;
}

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

function parsePromptBulkInput(raw: string) {
  return parseBulkInput(raw);
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
  promptOnly = false,
}: VideoTaskFormProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const singleImageInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [values, setValues] = useState<VideoTaskFormValues>(() => ({
    ...initialValues,
    rows: initialValues.rows.length ? initialValues.rows.map(createVideoTaskFormRow) : [createVideoTaskFormRow()],
  }));
  const [imageUploads, setImageUploads] = useState<ImageUploadItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptBulkInput, setPromptBulkInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const isPromptOnly = promptOnly; // 文生视频模式：不展示图片上传与图片列
  const promptPlaceholder = isPromptOnly ? '请输入视频提示词' : '请输入该图片对应的提示词';

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
    void clearCachedImages();
  }, [initialValues]);

  const rows = useMemo(() => values.rows, [values.rows]);

  const uploadSummary = useMemo(() => {
    if (!imageUploads.length) {
      return { totalBytes: 0, uploadedBytes: 0, progress: 0, successCount: 0, errorCount: 0 };
    }

    let totalBytes = 0;
    let uploadedBytes = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const item of imageUploads) {
      const size = item.size ?? 0;
      totalBytes += size;
      uploadedBytes += size * (item.progress / 100);
      if (item.status === 'success') {
        successCount += 1;
      } else if (item.status === 'error') {
        errorCount += 1;
      }
    }

    const progress =
      totalBytes > 0
        ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
        : Math.round(imageUploads.reduce((sum, item) => sum + item.progress, 0) / imageUploads.length);

    return { totalBytes, uploadedBytes, progress, successCount, errorCount };
  }, [imageUploads]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePageHide = () => {
      void clearCachedImages();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      void clearCachedImages();
    };
  }, []);

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
    const presignResponse = await fetch('/api/youtube/r2/presign', {
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

    const resolveRelativePath = (file: File) =>
      ((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name).toLowerCase();

    // Use natural sort on the original sequence so table order matches upload order.
    const sortedImageFiles = [...imageFiles].sort((a, b) =>
      resolveRelativePath(a).localeCompare(resolveRelativePath(b), undefined, { numeric: true, sensitivity: 'base' }),
    );

    const batchTimestamp = Date.now();
    const batchPrefix = `uploads/video-references/${batchTimestamp}`;
    const batchId = batchTimestamp;
    const cacheBatchId = `batch-${batchTimestamp}`;

    let cachedMetadata: CachedImageMetadata[] = [];
    try {
      await clearCachedImages();
      cachedMetadata = await cacheImageFiles(sortedImageFiles, cacheBatchId);
    } catch (error) {
      console.error('[VideoTaskForm] 缓存图片失败', error);
    }

    const metadataMap = new Map<string, CachedImageMetadata>();
    cachedMetadata.forEach((meta) => {
      const signature = `${meta.name}|${meta.size}|${meta.lastModified}`;
      metadataMap.set(signature, meta);
    });

    const initialStates = sortedImageFiles.map((file, index) => {
      const signature = `${file.name}|${file.size}|${file.lastModified}`;
      const matchedMetadata = metadataMap.get(signature);
      return {
        id: `${batchId}-${index}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending' as const,
        cacheKey: matchedMetadata?.cacheKey,
      };
    });
    setImageUploads(initialStates);
    setIsUploadingImages(true);

    const collectedUrls: string[] = [];

    for (let index = 0; index < sortedImageFiles.length; index += 1) {
      const file = sortedImageFiles[index];
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
    if (isPromptOnly) return;
    folderInputRef.current?.click();
  };

  const handleFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isPromptOnly) return;
    const fileList = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!fileList.length) return;
    void uploadImagesFromFiles(fileList);
  };

  const handleSingleImageButtonClick = () => {
    if (isPromptOnly) return;
    singleImageInputRef.current?.click();
  };

  const handleSingleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isPromptOnly) return;
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
    if (isPromptOnly) return;
    const parsed = parseBulkInput(bulkInput);
    if (!parsed.length) {
      toast.info('请输入至少一个图片路径');
      return;
    }
    addRowsFromUrls(parsed);
    setBulkInput('');
    toast.success(`已添加 ${parsed.length} 条路径`);
  };

  const handleBulkPromptApply = () => {
    const prompts = parsePromptBulkInput(promptBulkInput);
    if (!prompts.length) {
      toast.info('请输入至少一个提示词');
      return;
    }

    applyPromptsToRows(prompts);
    setPromptBulkInput('');
    setPromptDialogOpen(false);
    toast.success(`已添加 ${prompts.length} 条提示词`);
  };

  const handleSubmit = () => {
    const trimmedRows = rows.map((row) => ({
      id: row.id,
      imageUrl: row.imageUrl.trim(),
      prompt: row.prompt.trim(),
    }));

    if (promptOnly) {
      const promptRows = trimmedRows.filter((row) => row.prompt);
      if (!promptRows.length) {
        toast.error('请添加至少一条提示词');
        return;
      }
      const payload: VideoTaskFormSubmitPayload = {
        rows: promptRows.map((row) => ({
          imageUrl: '',
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
      return;
    }

    const validRows = trimmedRows.filter((row) => row.imageUrl || row.prompt);
    if (!validRows.length) {
      toast.error('请添加至少一行图片与提示词');
      return;
    }

    const someHavePrompts = validRows.some((row) => row.prompt);

    if (!someHavePrompts) {
      toast.error('请至少填写一个提示词');
      return;
    }

    // 如果有部分行没有提示词，使用第一个有提示词的行作为默认值
    const defaultPrompt = validRows.find((row) => row.prompt)?.prompt || '';
    const normalizedRows = validRows.map((row) => ({
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

  const dragEventHasFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (isPromptOnly) return;
    if (disableUpload || isUploadingImages) return;
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isPromptOnly) return;
    if (disableUpload || isUploadingImages) return;
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isPromptOnly) return;
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isPromptOnly) return;
    if (disableUpload || isUploadingImages) return;
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);

    if (droppedFiles.length) {
      void uploadImagesFromFiles(droppedFiles);
      event.dataTransfer?.clearData();
      return;
    }

    const textPayload = event.dataTransfer?.getData('text/plain');
    if (textPayload) {
      const parsed = parseBulkInput(textPayload);
      if (parsed.length) {
        addRowsFromUrls(parsed);
        toast.success(`已添加 ${parsed.length} 条路径`);
      } else {
        toast.error('未检测到有效的图片文件或路径');
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-gradient-to-br from-white to-slate-50 border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              📝 粘贴提示词
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              每行一个提示词，将按照顺序填充到对应的任务行。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={promptBulkInput}
            onChange={(event) => setPromptBulkInput(event.target.value)}
            placeholder={`请粘贴提示词，每行一个。\n例如：\n女孩开心地笑了\n男孩在公园里跑步\n夕阳下的海滩风景`}
            rows={8}
            className="border-2 border-slate-200 focus:border-purple-400 max-h-64 overflow-y-auto resize-none"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setPromptBulkInput('')} className="hover:bg-slate-100">
              清空
            </Button>
            <Button type="button" onClick={handleBulkPromptApply} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg">
              粘贴提示词
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        multiple
        data-testid="video-task-form-image-input"
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-lg font-bold text-slate-800">
                {isPromptOnly ? '📝 文生视频提示词' : '📷 参考图与提示词'}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {!isPromptOnly && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFolderButtonClick}
                      disabled={disableUpload || isUploadingImages}
                      className="bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all shadow-sm"
                    >
                      <FolderUpIcon className="mr-1.5 h-3.5 w-3.5" /> 上传文件夹
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSingleImageButtonClick}
                      disabled={disableUpload || isUploadingImages}
                      className="bg-white hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all shadow-sm"
                    >
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> 添加图片
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCsvButtonClick}
                  disabled={disableUpload}
                  className="bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-all shadow-sm"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> {isPromptOnly ? 'CSV 提示词' : 'CSV'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPromptDialogOpen(true)}
                  className="bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-all shadow-sm"
                >
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> 粘贴提示词
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-blue-600">ℹ️</span>
              <p className="text-xs text-blue-700 leading-relaxed">
                {isPromptOnly
                  ? '文生视频仅需填写提示词，可直接粘贴或通过 CSV 导入；无需上传图片。'
                  : '一行对应一张参考图与提示词，支持本地路径或在线 URL；若使用云雾 Sora 2，可只填写提示词。'}
              </p>
            </div>

            <div
              className={cn(
                'relative rounded-xl border-2 border-slate-200 transition-all shadow-sm overflow-hidden',
                (disableUpload || isUploadingImages) && 'opacity-70',
                isDragOver && 'border-dashed border-purple-400 bg-purple-50/70 shadow-lg',
              )}
              {...(!isPromptOnly
                ? {
                    onDragEnter: handleDragEnter,
                    onDragOver: handleDragOver,
                    onDragLeave: handleDragLeave,
                    onDrop: handleDrop,
                  }
                : {})}
            >
              {isDragOver ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-purple-50 to-blue-50 backdrop-blur-sm">
                  <ImagePlus className="h-8 w-8 text-purple-600" />
                  <span className="text-base font-bold text-purple-700">松手即可上传图片（支持多张）</span>
                </div>
              ) : null}
              <Table className={cn('relative transition-opacity', isDragOver && 'opacity-40')}>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 border-b-2 border-slate-200">
                    <TableHead className="w-16 text-center font-bold text-slate-700">序号</TableHead>
                    {!isPromptOnly && <TableHead className="w-[40%] font-bold text-slate-700">图片路径</TableHead>}
                    <TableHead className="font-bold text-slate-700">提示词</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="text-center text-sm text-slate-600">{index + 1}</TableCell>
                      {!isPromptOnly && (
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
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            value={row.prompt}
                            placeholder={promptPlaceholder}
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

            {!isPromptOnly && (
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
            )}
          </div>

          {!isPromptOnly && imageUploads.length > 0 && (
            <div className="space-y-4 rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white via-slate-50 to-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg">
                  <ImagePlus className="h-4 w-4 text-purple-600" />
                </div>
                <p className="text-sm font-bold text-slate-800">上传进度</p>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">总进度</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700">
                      完成 {uploadSummary.successCount}/{imageUploads.length}
                    </span>
                    {uploadSummary.errorCount > 0 && (
                      <span className="text-xs font-semibold text-rose-700">
                        失败 {uploadSummary.errorCount}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-md">
                      {uploadSummary.progress}%
                    </span>
                  </div>
                </div>
                <Progress value={uploadSummary.progress} className="h-3" />
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {imageUploads.map((item) => (
                  <div key={item.id} className="space-y-2 p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700 truncate max-w-[240px] text-xs" title={item.name}>
                        📷 {item.name}
                      </span>
                      <span
                        className={cn(
                          'whitespace-nowrap rounded-lg px-2.5 py-1 font-bold text-xs',
                          item.status === 'success'
                            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white'
                            : item.status === 'error'
                              ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white'
                              : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
                        )}
                      >
                        {item.status === 'success' ? '✓ 成功' : item.status === 'error' ? '✗ 失败' : '⟳ 上传中'}
                      </span>
                    </div>
                    <Progress value={item.progress} className="h-2" />
                    {item.url ? (
                      <div className="text-xs" title={item.url}>
                        <span className="text-slate-500">
                          {truncateUrl(item.url, 60)}
                        </span>
                      </div>
                    ) : null}
                    {item.error ? <p className="text-xs font-medium text-rose-600">⚠️ {item.error}</p> : null}
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
                  {VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => (
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
