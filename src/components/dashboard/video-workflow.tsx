'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Upload,
  Download,
  Copy,
  Trash2,
  RotateCcw,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Video,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  PlusCircle
} from 'lucide-react';
import { 
  ShotPrompt, 
  GeneratedImage, 
  VideoPrompt, 
  ApiError,
  ShotPromptsResponse,
  UploadResponse,
  ReorderResponse,
  VideoPromptsResponse,
  PromptEntry
} from '@/lib/types';
import { api } from '@/lib/api';
import defaultWorkflow from '@/data/default-video-workflow.json';
import pLimit from 'p-limit';
import { ensureRemoteImageUrl } from '@/lib/r2/r2Upload';
import { toast } from 'sonner';
import { VideoTaskBoard } from '@/components/dashboard/video-task-board';
import { ShotPromptEditor } from '@/components/workflow/shot-prompt-editor';
import { VideoPromptEditor } from '@/components/workflow/video-prompt-editor';
import {
  VideoTaskForm,
  createEmptyVideoTaskDraft,
  type VideoTaskFormSubmitPayload,
} from '@/components/dashboard/video-task-form';

type DefaultWorkflow = {
  script: string;
  shots: ShotPrompt[];
  images: GeneratedImage[];
  videoPrompts: VideoPrompt[];
};

const DEFAULT_WORKFLOW: DefaultWorkflow = {
  script: defaultWorkflow.script ?? `整个故事脚本只有一个角色A（橘猫tom），故事只有3个分镜，故事如下：

橘猫tom在吃早饭
橘猫tom背着书包走在街道上
橘猫tom在教室内上课`,
  shots: (defaultWorkflow.shots as ShotPrompt[] | undefined) ?? [],
  images:
    (defaultWorkflow.images as GeneratedImage[] | undefined)?.map((image) => ({
      ...image,
      source: image.source ?? 'generated',
    })) ?? [],
  videoPrompts: (defaultWorkflow.videoPrompts as VideoPrompt[] | undefined) ?? [],
};

function formatUrlDisplay(raw?: string | null) {
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const segments = decodedPath.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // ignore invalid urls
  }
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  data?: unknown;
}

interface ImageUploadStatus {
  shot_id: string;
  imageUrl: string;
  prompt: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'generating' | 'completed' | 'error';
  progress: number;
  r2Url?: string;
  videoTaskNumber?: string;
  videoUrl?: string;
  error?: string;
}

export function VideoWorkflow() {
  const queryClient = useQueryClient();
  const [script, setScript] = useState(DEFAULT_WORKFLOW.script);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 'script', title: '输入脚本', description: '输入故事脚本', status: DEFAULT_WORKFLOW.script ? 'completed' : 'pending', data: DEFAULT_WORKFLOW.script },
    { id: 'shots', title: '生成分镜', description: 'AI 生成分镜 JSON', status: DEFAULT_WORKFLOW.shots.length ? 'completed' : 'pending', data: DEFAULT_WORKFLOW.shots },
    { id: 'images', title: '批量出图', description: '生成图片（Mock）', status: DEFAULT_WORKFLOW.images.length ? 'completed' : 'pending', data: DEFAULT_WORKFLOW.images },
    { id: 'edit', title: '编辑排序', description: '拖拽排序、上传补图', status: DEFAULT_WORKFLOW.images.length ? 'pending' : 'pending' },
    { id: 'video-prompts', title: '视频提示词', description: '生成图生视频提示词', status: DEFAULT_WORKFLOW.videoPrompts.length ? 'completed' : 'pending', data: DEFAULT_WORKFLOW.videoPrompts },
    { id: 'video-batch', title: '批量出视频', description: '提交图生视频任务', status: 'pending' },
    { id: 'export', title: '导出结果', description: '导出 JSON/CSV', status: DEFAULT_WORKFLOW.videoPrompts.length ? 'pending' : 'pending' }
  ]);
  
  const [shotPrompts, setShotPrompts] = useState<ShotPrompt[]>(DEFAULT_WORKFLOW.shots);
  const [images, setImages] = useState<GeneratedImage[]>(DEFAULT_WORKFLOW.images);
  const [videoPrompts, setVideoPrompts] = useState<VideoPrompt[]>(DEFAULT_WORKFLOW.videoPrompts);
  const [createdTaskNumbers, setCreatedTaskNumbers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  const [batchVideoStatus, setBatchVideoStatus] = useState<ImageUploadStatus[]>([]);
  const [isUploadingToR2, setIsUploadingToR2] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isAddingVideoTasks, setIsAddingVideoTasks] = useState(false);
  const [taskFormResetKey, setTaskFormResetKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: workflowSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const taskFormInitialValues = useMemo(
    () =>
      createEmptyVideoTaskDraft({
        aspectRatio: workflowSettings?.videoSettings.defaultAspectRatio,
        watermark: workflowSettings?.videoSettings.defaultWatermark,
        callbackUrl: workflowSettings?.videoSettings.defaultCallback,
        enableFallback: workflowSettings?.videoSettings.enableFallback,
        enableTranslation: workflowSettings?.videoSettings.enableTranslation,
      }),
    [workflowSettings],
  );
  const selectFolderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/system/select-folder', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || '选择文件夹失败');
      }
      return (await response.json()) as { success: boolean; path: string };
    },
    onSuccess: async (result) => {
      if (result?.success && result.path) {
        await api.updateSettings({ videoSettings: { savePath: result.path } });
        toast.success(`已更新视频存储文件夹：${result.path}`);
        await queryClient.invalidateQueries({ queryKey: ['settings'] });
      } else {
        toast.error('选择文件夹失败');
      }
    },
    onError: (error: Error) => toast.error(error.message || '选择文件夹失败'),
  });

  const updateStepStatus = useCallback((stepId: string, status: WorkflowStep['status'], data?: unknown) => {
    setSteps(prev =>
      prev.map(step =>
        step.id === stepId
          ? { ...step, status, data }
          : step
      )
    );
  }, []);

  const applyReorderResult = useCallback((data: ReorderResponse) => {
    console.info('[VideoWorkflow] Applying reorder result', {
      mappingSize: Object.keys(data.mapping).length,
    });
    setImages(data.images);
    let updatedShots: ShotPrompt[] | null = null;
    setShotPrompts(prev => {
      const next = prev.map(shot => {
        const newId = data.mapping[shot.shot_id];
        return newId ? { ...shot, shot_id: newId } : shot;
      });
      updatedShots = next;
      return next;
    });
    if (updatedShots) {
      updateStepStatus('shots', 'completed', updatedShots);
    }
    setVideoPrompts(prev => (prev.length > 0 ? [] : prev));
    setCreatedTaskNumbers([]);
    updateStepStatus('images', 'completed', data.images);
    updateStepStatus('edit', 'pending');
    updateStepStatus('video-prompts', 'pending');
    updateStepStatus('video-batch', 'pending');
    updateStepStatus('export', 'pending');
  }, [updateStepStatus]);

  const requestReorder = useCallback(async (payloadImages: GeneratedImage[]) => {
    console.info('[VideoWorkflow] Requesting reorder API', { imageCount: payloadImages.length });
    const response = await fetch('/api/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: payloadImages })
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.hint);
    }

    const data: ReorderResponse = await response.json();
    applyReorderResult(data);
    console.info('[VideoWorkflow] Reorder API succeeded', { imageCount: data.images.length });
    return data;
  }, [applyReorderResult]);

  const ensureSequentialImages = useCallback(async (): Promise<GeneratedImage[]> => {
    const sequential = images.every(
      (image, index) => image.shot_id === `shot_${(index + 1).toString().padStart(3, '0')}`
    );
    if (sequential) {
      console.info('[VideoWorkflow] Images already sequential');
      return images;
    }
    console.info('[VideoWorkflow] Images not sequential, triggering reorder');
    const data = await requestReorder(images);
    return data.images;
  }, [images, requestReorder]);

  const retryWithBackoff = async <T,>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 指数退避：200ms * 1.6^attempt，最大5秒
          const delay = Math.min(200 * Math.pow(1.6, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        console.info('[VideoWorkflow] Operation attempt', { operationName, attempt: attempt + 1 });
        
        const result = await operation();
        setRetryCount(0); // 成功后重置重试计数
        console.info('[VideoWorkflow] Operation succeeded', { operationName, attempt: attempt + 1 });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        setRetryCount(attempt + 1);
        console.warn(`${operationName} 第${attempt + 1}次尝试失败，${attempt < maxRetries ? '准备重试' : '已达到最大重试次数'}:`, lastError.message);
      }
    }
    
    throw lastError;
  };

  const handleShotPromptsChange = (shots: ShotPrompt[]) => {
    setShotPrompts(shots);
    setError(null);
    setWarning(null);
    setCreatedTaskNumbers([]);
    setBatchVideoStatus([]);

    if (shots.length) {
      updateStepStatus('shots', 'completed', shots);
    } else {
      updateStepStatus('shots', 'pending', []);
    }

    setImages([]);
    setVideoPrompts([]);
    updateStepStatus('images', 'pending');
    updateStepStatus('video-prompts', 'pending');
    updateStepStatus('video-batch', 'pending');
    updateStepStatus('export', 'pending');
  };

  const handleVideoPromptsChange = (prompts: VideoPrompt[]) => {
    setVideoPrompts(prompts);
    setError(null);
    setWarning(null);
    setCreatedTaskNumbers([]);
    setBatchVideoStatus([]);

    if (prompts.length) {
      updateStepStatus('video-prompts', 'completed', prompts);
      updateStepStatus('video-batch', 'pending');
    } else {
      updateStepStatus('video-prompts', 'pending', []);
      updateStepStatus('video-batch', 'pending');
    }
  };

  const handleGenerateShots = async () => {
    console.info('[VideoWorkflow] Start generating shot prompts', { scriptLength: script.length });
    if (!script.trim()) {
      setError('请输入故事脚本');
      console.error('[VideoWorkflow] Missing script input');
      return;
    }

    setIsLoading(true);
    setError(null);
    updateStepStatus('shots', 'in-progress');

    try {
      const data = await retryWithBackoff(
        async () => {
          const response = await fetch('/api/shot-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script })
          });

          if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.hint);
          }

          return await response.json() as ShotPromptsResponse;
        },
        '生成分镜'
      );

      setShotPrompts(data.shots);
      setVideoPrompts([]);
      setImages([]);
      setCreatedTaskNumbers([]);
      updateStepStatus('shots', 'completed', data.shots);
      updateStepStatus('images', 'pending');
      updateStepStatus('edit', 'pending');
      updateStepStatus('video-prompts', 'pending');
      updateStepStatus('video-batch', 'pending');
      updateStepStatus('export', 'pending');
      console.info('[VideoWorkflow] Shot prompts generated', { count: data.shots.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成分镜失败');
      updateStepStatus('shots', 'error');
      console.error('[VideoWorkflow] Shot prompt generation failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    console.info('[VideoWorkflow] Start batch image generation', { shotCount: shotPrompts.length });
    if (shotPrompts.length === 0) {
      setError('请先生成分镜');
      console.error('[VideoWorkflow] Cannot generate images without shots');
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);
    setRetryCount(0);
    updateStepStatus('images', 'in-progress');

    try {
      const existing = await api.getPrompts();
      const existingMap = new Map<string, PromptEntry>(existing.prompts.map((item) => [item.number, item]));
      const shotToNumber = new Map<string, string>();
      const numberToShot = new Map<string, string>();
      const newShots: ShotPrompt[] = [];
      const addPayload: { prompt: string; number: string }[] = [];
      const updatePromises: Promise<unknown>[] = [];

      shotPrompts.forEach((shot) => {
        const targetNumber = shot.shot_id;
        const matched = existingMap.get(targetNumber);
        if (matched) {
          shotToNumber.set(shot.shot_id, matched.number);
          numberToShot.set(matched.number, shot.shot_id);
          const needsUpdate =
            matched.prompt.trim() !== shot.image_prompt.trim() ||
            matched.status !== '等待中' ||
            matched.localPath ||
            matched.imageUrl ||
            matched.errorMsg;
          if (needsUpdate) {
            updatePromises.push(
              api.updatePrompt(matched.number, {
                prompt: shot.image_prompt,
                status: '等待中',
                localPath: '',
                imageUrl: '',
                errorMsg: '',
                actualFilename: '',
              })
            );
          }
        } else {
          newShots.push(shot);
          addPayload.push({ prompt: shot.image_prompt, number: targetNumber });
        }
      });

      if (addPayload.length > 0) {
        const created = await api.addPrompts(addPayload);
        created.prompts.forEach((entry, index) => {
          const shot = newShots[index];
          const finalNumber = entry.number;
          shotToNumber.set(shot.shot_id, finalNumber);
          numberToShot.set(finalNumber, shot.shot_id);
          if (finalNumber !== shot.shot_id) {
            console.warn('[VideoWorkflow] Prompt number adjusted to avoid conflict', {
              requested: shot.shot_id,
              assigned: finalNumber,
            });
          }
        });
      }

      if (updatePromises.length > 0) {
        const updateResults = await Promise.allSettled(updatePromises);
        const failed = updateResults.find((result) => result.status === 'rejected');
        if (failed && failed.status === 'rejected') {
          throw new Error(
            failed.reason instanceof Error
              ? `更新提示词失败: ${failed.reason.message}`
              : '更新提示词失败'
          );
        }
      }

      if (shotPrompts.some((shot) => !shotToNumber.has(shot.shot_id))) {
        throw new Error('未能同步全部分镜到提示词库，请稍后重试');
      }

      const numbersToGenerate = Array.from(new Set(Array.from(shotToNumber.values())));
      if (!numbersToGenerate.length) {
        throw new Error('没有可用于批量出图的提示词编号');
      }

      const generationResult = await retryWithBackoff(
        () => api.startImageGeneration({ mode: 'selected', numbers: numbersToGenerate }),
        '批量出图',
        maxRetries
      );

      if (!generationResult.success) {
        if (generationResult.failed.length) {
          const summary = generationResult.failed
            .slice(0, 3)
            .map((item) => `${item.jobId}: ${item.error?.message ?? '未知错误'}`)
            .join('；');
          throw new Error(summary || '批量出图任务提交失败');
        }
        throw new Error(generationResult.message ?? '批量出图任务提交失败');
      }

      if (generationResult.warnings?.length) {
        const message = generationResult.warnings.join('；');
        setWarning(message);
        console.warn('[VideoWorkflow] Image generation warnings', { warnings: generationResult.warnings });
      } else {
        setWarning(null);
      }

      const POLL_INTERVAL = 4_000;
      const MAX_WAIT = 10 * 60 * 1000; // 10 分钟超时
      const startTime = Date.now();
      const numbersSet = new Set(numbersToGenerate);

      while (true) {
        if (Date.now() - startTime > MAX_WAIT) {
          throw new Error('批量出图任务超时，请稍后重试');
        }

        const { prompts } = await api.getPrompts();
        const relevant = prompts.filter((prompt) => numbersSet.has(prompt.number));

        if (relevant.length < numbersToGenerate.length) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          continue;
        }

        const failures = relevant.filter((prompt) => prompt.status === '失败');
        if (failures.length > 0) {
          const failedShots = failures.map((prompt) => {
            const shotId = numberToShot.get(prompt.number) ?? prompt.number;
            const reason = prompt.errorMsg?.trim();
            return reason ? `${shotId}（${reason}）` : shotId;
          });
          console.error('[VideoWorkflow] Batch image generation failures', {
            failures: failedShots,
          });
          throw new Error(`以下镜头生成失败: ${failedShots.join('、')}`);
        }

        const inProgress = relevant.some((prompt) => prompt.status !== '成功');
        if (inProgress) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          continue;
        }

        const nextImages: GeneratedImage[] = shotPrompts
          .map((shot) => {
            const number = shotToNumber.get(shot.shot_id);
            if (!number) return null;
            const promptEntry = relevant.find((prompt) => prompt.number === number);
            if (!promptEntry) return null;
            const imageUrl = promptEntry.localPath ? `/${promptEntry.localPath}` : promptEntry.imageUrl ?? '';
            if (!imageUrl) return null;
            return {
              shot_id: shot.shot_id,
              url: imageUrl,
              source: 'generated',
            } as GeneratedImage;
          })
          .filter((item): item is GeneratedImage => item !== null);

        if (!nextImages.length) {
          throw new Error('出图成功但未找到可用图片路径');
        }

        setImages(nextImages);
        setCreatedTaskNumbers([]);
        updateStepStatus('images', 'completed', nextImages);
        updateStepStatus('edit', 'pending');
        updateStepStatus('video-prompts', 'pending');
        updateStepStatus('video-batch', 'pending');
        console.info('[VideoWorkflow] Images generated via prompt manager', { count: nextImages.length });
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量出图失败';
      setError(message);
      setWarning(null);
      updateStepStatus('images', 'error');
      console.error('[VideoWorkflow] Image generation failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (files: FileList) => {
    console.info('[VideoWorkflow] Start image upload', { fileCount: files.length });
    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.hint);
      }

      return (await response.json() as UploadResponse).image;
    });

    try {
      const uploadedImages = await Promise.all(uploadPromises);
      setImages(prev => [...prev, ...uploadedImages]);
      setCreatedTaskNumbers([]);
      updateStepStatus('video-prompts', 'pending');
      updateStepStatus('video-batch', 'pending');
      updateStepStatus('export', 'pending');
      console.info('[VideoWorkflow] Upload succeeded', { uploadedCount: uploadedImages.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      console.error('[VideoWorkflow] Upload failed', err);
    }
  };

  const handleReorder = async () => {
    console.info('[VideoWorkflow] Start reorder', { imageCount: images.length });
    if (images.length === 0) {
      setError('没有图片需要重排');
      console.error('[VideoWorkflow] Reorder skipped due to empty image list');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await requestReorder(images);
      console.info('[VideoWorkflow] Reorder completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重排失败');
      console.error('[VideoWorkflow] Reorder failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideoPrompts = async () => {
    console.info('[VideoWorkflow] Start generating video prompts', { imageCount: images.length });
    if (images.length === 0) {
      setError('请先生成或上传图片');
      console.error('[VideoWorkflow] Cannot generate video prompts without images');
      return;
    }

    setIsLoading(true);
    setError(null);
    updateStepStatus('video-prompts', 'in-progress');

    try {
      const orderedImages = await ensureSequentialImages();

      const data = await retryWithBackoff(
        async () => {
          const response = await fetch('/api/video-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              script, 
              images: orderedImages.map(img => ({ shot_id: img.shot_id, url: img.url }))
            })
          });

          if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.hint);
          }

          return await response.json() as VideoPromptsResponse;
        },
        '生成视频提示词'
      );

      setVideoPrompts(data.prompts);
      setCreatedTaskNumbers([]);
      updateStepStatus('video-prompts', 'completed', data.prompts);
      updateStepStatus('video-batch', 'pending');
      updateStepStatus('export', 'pending');
      console.info('[VideoWorkflow] Video prompts generated', { count: data.prompts.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成视频提示词失败');
      updateStepStatus('video-prompts', 'error');
      console.error('[VideoWorkflow] Video prompt generation failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddVideoTasksFromForm = async (payload: VideoTaskFormSubmitPayload) => {
    if (!payload.rows.length) {
      toast.error('请至少添加一个视频任务');
      return;
    }

    setIsAddingVideoTasks(true);
    try {
      const createdNumbers: string[] = [];
      for (let index = 0; index < payload.rows.length; index += 1) {
        const row = payload.rows[index];
        console.info('[VideoWorkflow] 添加视频任务', { index: index + 1, row });
        const result = await api.addVideoTask({
          prompt: row.prompt,
          imageUrls: [row.imageUrl],
          aspectRatio: payload.aspectRatio,
          watermark: payload.watermark,
          callbackUrl: payload.callbackUrl,
          seeds: payload.seeds,
          enableFallback: payload.enableFallback,
          enableTranslation: payload.enableTranslation,
        });
        if (result.success) {
          createdNumbers.push(result.task.number);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });

      if (createdNumbers.length) {
        setCreatedTaskNumbers(createdNumbers);
        toast.success(`已添加 ${createdNumbers.length} 个视频任务`);
      } else {
        toast.info('没有任务被添加');
      }

      setShowTaskForm(false);
      setTaskFormResetKey((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : '添加视频任务失败';
      toast.error(message);
      console.error('[VideoWorkflow] 添加视频任务失败', err);
    } finally {
      setIsAddingVideoTasks(false);
    }
  };

  const handleBatchUploadToR2 = async () => {
    console.info('[VideoWorkflow] Start batch upload to R2', {
      imageCount: images.length,
      promptCount: videoPrompts.length,
    });

    if (images.length === 0) {
      setError('请先准备对应的参考图片');
      toast.error('请先准备对应的参考图片');
      return;
    }

    if (videoPrompts.length === 0) {
      setError('请先生成视频提示词');
      toast.error('请先生成视频提示词');
      return;
    }

    const imageMap = new Map(images.map((image) => [image.shot_id, image]));
    const missingShots = videoPrompts.filter((prompt) => !imageMap.has(prompt.shot_id));

    if (missingShots.length > 0) {
      const missingList = missingShots.map((item) => item.shot_id).join('、');
      setError(`以下镜头缺少对应图片：${missingList}`);
      toast.error(`以下镜头缺少对应图片：${missingList}`);
      return;
    }

    setIsUploadingToR2(true);
    setError(null);
    setCreatedTaskNumbers([]);

    // 初始化状态
    const initialStatus: ImageUploadStatus[] = videoPrompts.map((prompt) => {
      const image = imageMap.get(prompt.shot_id);
      return {
        shot_id: prompt.shot_id,
        imageUrl: image?.url || '',
        prompt: prompt.image_prompt,
        status: 'pending',
        progress: 0,
      };
    });
    setBatchVideoStatus(initialStatus);

    try {
      const uploadLimit = pLimit(3);
      const batchPrefix = `videos/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

      const uploadTasks = initialStatus.map((item) =>
        uploadLimit(async () => {
          // 更新状态为上传中
          setBatchVideoStatus((prev) =>
            prev.map((s) =>
              s.shot_id === item.shot_id
                ? { ...s, status: 'uploading', progress: 0 }
                : s
            )
          );

          try {
            const remoteUrl = await ensureRemoteImageUrl({
              inputUrl: item.imageUrl,
              filenameHint: item.imageUrl.split('/').pop() || `${item.shot_id}.png`,
              prefix: batchPrefix,
              onProgress: (progress) => {
                setBatchVideoStatus((prev) =>
                  prev.map((s) =>
                    s.shot_id === item.shot_id
                      ? { ...s, progress }
                      : s
                  )
                );
              },
            });

            // 更新状态为上传完成
            setBatchVideoStatus((prev) =>
              prev.map((s) =>
                s.shot_id === item.shot_id
                  ? { ...s, status: 'uploaded', progress: 100, r2Url: remoteUrl }
                  : s
              )
            );

            return { shot_id: item.shot_id, remoteUrl };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '上传失败';
            setBatchVideoStatus((prev) =>
              prev.map((s) =>
                s.shot_id === item.shot_id
                  ? { ...s, status: 'error', error: errorMsg }
                  : s
              )
            );
            throw error;
          }
        })
      );

      await Promise.all(uploadTasks);
      toast.success('所有图片已上传到R2');
      console.info('[VideoWorkflow] All images uploaded to R2');
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量上传图片失败';
      setError(message);
      toast.error(message);
      console.error('[VideoWorkflow] Batch upload to R2 failed', err);
    } finally {
      setIsUploadingToR2(false);
    }
  };

  const handleBatchGenerateVideos = async () => {
    console.info('[VideoWorkflow] Start batch generate videos', {
      statusCount: batchVideoStatus.length,
    });

    // 检查是否所有图片都已上传
    const allUploaded = batchVideoStatus.every(
      (item) => item.status === 'uploaded' && item.r2Url
    );

    if (!allUploaded) {
      setError('请先完成图片上传到R2');
      toast.error('请先完成图片上传到R2');
      return;
    }

    setIsGeneratingVideos(true);
    setError(null);
    updateStepStatus('video-batch', 'in-progress');

    try {
      const { videoSettings } = await retryWithBackoff(
        () => api.getSettings(),
        '获取视频设置',
        2
      );

      const aspectRatio = videoSettings.defaultAspectRatio || '9:16';
      const watermark = videoSettings.defaultWatermark || '';
      const callbackUrl = videoSettings.defaultCallback || '';
      const enableFallback = videoSettings.enableFallback ?? false;
      const enableTranslation = videoSettings.enableTranslation ?? true;

      const createdNumbers: string[] = [];

      // 为每个图片创建视频任务
      for (const item of batchVideoStatus) {
        if (!item.r2Url) continue;

        // 更新状态为生成中
        setBatchVideoStatus((prev) =>
          prev.map((s) =>
            s.shot_id === item.shot_id
              ? { ...s, status: 'generating' }
              : s
          )
        );

        try {
          console.info('[VideoWorkflow] Creating video task', {
            shotId: item.shot_id,
            imageUrl: item.r2Url,
          });

          const result = await retryWithBackoff(
            () =>
              api.addVideoTask({
                prompt: item.prompt,
                imageUrls: [item.r2Url!],
                aspectRatio,
                watermark,
                callbackUrl,
                enableFallback,
                enableTranslation,
              }),
            `添加视频任务 ${item.shot_id}`,
            maxRetries
          );

          if (!result.success) {
            throw new Error(`添加视频任务失败：${item.shot_id}`);
          }

          createdNumbers.push(result.task.number);

          // 更新状态
          setBatchVideoStatus((prev) =>
            prev.map((s) =>
              s.shot_id === item.shot_id
                ? { ...s, videoTaskNumber: result.task.number }
                : s
            )
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '创建任务失败';
          setBatchVideoStatus((prev) =>
            prev.map((s) =>
              s.shot_id === item.shot_id
                ? { ...s, status: 'error', error: errorMsg }
                : s
            )
          );
          throw error;
        }
      }

      if (!createdNumbers.length) {
        throw new Error('没有可提交的视频任务');
      }

      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });

      // 启动批量生成
      console.info('[VideoWorkflow] Video tasks created, starting generation', {
        numbers: createdNumbers,
      });

      const startResponse = await retryWithBackoff(
        () => api.startVideoGeneration(createdNumbers),
        '批量出视频',
        maxRetries
      );

      if (!startResponse.success) {
        throw new Error(startResponse.message ?? '批量出视频任务提交失败');
      }

      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });

      // 更新所有状态为已完成
      setBatchVideoStatus((prev) =>
        prev.map((s) =>
          s.status === 'generating'
            ? { ...s, status: 'completed' }
            : s
        )
      );

      const summary = `已创建并启动 ${createdNumbers.length} 个视频任务`;
      setCreatedTaskNumbers(createdNumbers);
      setWarning(summary);
      updateStepStatus('video-batch', 'completed', createdNumbers);
      updateStepStatus('export', 'pending');
      toast.success(summary);
      console.info('[VideoWorkflow] Batch video generation started', {
        numbers: createdNumbers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量出视频失败';
      setError(message);
      setCreatedTaskNumbers([]);
      updateStepStatus('video-batch', 'error');
      toast.error(message);
      console.error('[VideoWorkflow] Batch video generation failed', err);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const handleDeleteImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setCreatedTaskNumbers([]);
    updateStepStatus('video-batch', 'pending');
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      return newImages;
    });
    setCreatedTaskNumbers([]);
    updateStepStatus('video-batch', 'pending');
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      handleMoveImage(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const exportToJSON = () => {
    const data = {
      script,
      shotPrompts,
      images,
      videoPrompts
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-workflow-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportToCSV = (type: 'shots' | 'video-prompts') => {
    let csvContent = '';
    let filename = '';

    if (type === 'shots' && shotPrompts.length > 0) {
      // CSV-A: 分镜 → 文生图
      csvContent = 'shot_id,image_prompt,aspect\n';
      shotPrompts.forEach(shot => {
        const escapedPrompt = shot.image_prompt.replace(/"/g, '""');
        csvContent += `"${shot.shot_id}","${escapedPrompt}","9:16"\n`;
      });
      filename = `shots-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === 'video-prompts' && videoPrompts.length > 0) {
      // CSV-B: 图生视频
      csvContent = 'shot_id,image_prompt\n';
      videoPrompts.forEach(prompt => {
        const escapedPrompt = prompt.image_prompt.replace(/"/g, '""');
        csvContent += `"${prompt.shot_id}","${escapedPrompt}"\n`;
      });
      filename = `video-prompts-${new Date().toISOString().split('T')[0]}.csv`;
    }

    if (csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getStepIcon = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in-progress': return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const batchStep = steps.find((step) => step.id === 'video-batch');

  return (
    <div className="space-y-6">
      {/* 工作流步骤指示器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            视频生成工作流
          </CardTitle>
          <CardDescription>
            从文本脚本到视频提示词的完整工作流程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center space-y-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
                  {getStepIcon(step.status)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            {retryCount > 0 && (
              <div className="mt-2 text-sm">
                重试次数: {retryCount}/{maxRetries}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 告警提示 */}
      {warning && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {/* 重试提示 */}
      {retryCount > 0 && retryCount < maxRetries && (
        <Alert>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <AlertDescription>
            正在重试操作... ({retryCount}/{maxRetries})
          </AlertDescription>
        </Alert>
      )}

      {/* 步骤1: 脚本输入 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            步骤1: 输入故事脚本
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="script">故事脚本</Label>
            <Textarea
              id="script"
              placeholder="请输入您的故事脚本..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[200px]"
              maxLength={4000}
            />
            <p className="text-sm text-gray-500 mt-1">
              {script.length}/4000 字符
            </p>
          </div>
          <Button 
            onClick={handleGenerateShots}
            disabled={!script.trim() || isLoading}
            className="w-full"
          >
            <Play className="mr-2 h-4 w-4" />
            生成分镜
          </Button>
        </CardContent>
      </Card>

      {/* 步骤2: 分镜预览 */}
      <div className="space-y-3">
        <ShotPromptEditor
          value={shotPrompts}
          onChange={handleShotPromptsChange}
          title={`步骤2: 分镜预览 (${shotPrompts.length} 个镜头)`}
          description="支持手动编辑或导入 CSV/JSON，亦可直接添加新分镜。"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleGenerateImages}
            disabled={isLoading || shotPrompts.length === 0}
            className="flex-1 md:flex-none"
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            批量生成图片
          </Button>
          <Button
            onClick={() => exportToCSV('shots')}
            variant="outline"
            disabled={shotPrompts.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            导出 CSV
          </Button>
        </div>
      </div>

      {/* 步骤3: 图片网格 */}
      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              步骤3: 图片编辑 ({images.length} 张图片)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  上传补图
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleReorder}
                  disabled={isLoading}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  重排编号
                </Button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <div 
                    key={`${image.shot_id}-${index}`} 
                    className={`relative group cursor-move transition-all duration-200 ${
                      draggedIndex === index ? 'opacity-50 scale-95' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-300 transition-colors">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={image.url} 
                        alt={image.shot_id}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <Badge variant={image.source === 'generated' ? 'default' : 'secondary'}>
                        {image.source === 'generated' ? 'AI生成' : '上传'}
                      </Badge>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteImage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                        {image.shot_id}
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                        拖拽排序
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                onClick={handleGenerateVideoPrompts}
                disabled={isLoading}
                className="w-full"
              >
                <Video className="mr-2 h-4 w-4" />
                生成视频提示词
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步骤4: 视频提示词 */}
      <div className="space-y-3">
        <VideoPromptEditor
          value={videoPrompts}
          onChange={handleVideoPromptsChange}
          title={`步骤4: 视频提示词 (${videoPrompts.length} 个)`}
          description="可手动维护或导入视频提示词，支持 CSV/JSON。"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => copyToClipboard(JSON.stringify(videoPrompts, null, 2))}
            variant="outline"
            disabled={videoPrompts.length === 0}
          >
            <Copy className="mr-2 h-4 w-4" />
            复制 JSON
          </Button>
          <Button onClick={exportToJSON} variant="outline" disabled={videoPrompts.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            下载 JSON
          </Button>
          <Button
            onClick={() => exportToCSV('video-prompts')}
            variant="outline"
            disabled={videoPrompts.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            导出 CSV
          </Button>
        </div>
      </div>

      {/* 步骤5: 批量图生视频 */}
      {videoPrompts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              步骤5: 批量图生视频
            </CardTitle>
            <CardDescription>
              先上传图片到R2，再批量生成视频
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">当前状态:</span>
              <Badge
                variant={
                  batchStep?.status === 'completed'
                    ? 'default'
                    : batchStep?.status === 'in-progress'
                      ? 'secondary'
                      : 'outline'
                }
                className={
                  batchStep?.status === 'error'
                    ? 'border-red-500 text-red-600'
                    : batchStep?.status === 'in-progress'
                      ? 'border-blue-500 text-blue-600'
                      : undefined
                }
              >
                {batchStep?.status === 'completed'
                  ? '已提交'
                  : batchStep?.status === 'in-progress'
                    ? '处理中'
                    : batchStep?.status === 'error'
                      ? '提交失败'
                      : '待处理'}
              </Badge>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => selectFolderMutation.mutate()}
                disabled={selectFolderMutation.isPending}
                className="flex-1 md:flex-none"
              >
                {selectFolderMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                选择视频存储文件夹
              </Button>
              <Button
                onClick={handleBatchUploadToR2}
                disabled={isUploadingToR2 || isGeneratingVideos || isLoading}
                className="flex-1 md:flex-none"
              >
                {isUploadingToR2 ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                批量上传图片到R2
              </Button>
              <Button
                onClick={handleBatchGenerateVideos}
                disabled={
                  isUploadingToR2 ||
                  isGeneratingVideos ||
                  isLoading ||
                  batchVideoStatus.length === 0 ||
                  !batchVideoStatus.every((item) => item.status === 'uploaded')
                }
                className="flex-1 md:flex-none"
              >
                {isGeneratingVideos ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Video className="mr-2 h-4 w-4" />
                )}
                批量生成视频
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowTaskForm((prev) => !prev)}
                disabled={isAddingVideoTasks}
                className="flex-1 md:flex-none"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                {showTaskForm ? '收起任务面板' : '添加图生视频任务'}
              </Button>
            </div>

            {showTaskForm && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <VideoTaskForm
                  key={taskFormResetKey}
                  mode="create"
                  initialValues={taskFormInitialValues}
                  onSubmit={handleAddVideoTasksFromForm}
                  onCancel={() => setShowTaskForm(false)}
                  isSubmitting={isAddingVideoTasks}
                  disableUpload={isAddingVideoTasks}
                  submitLabel={isAddingVideoTasks ? '提交中...' : '添加任务'}
                  cancelLabel="取消"
                />
              </div>
            )}

            {/* 批量视频状态展示 */}
            {batchVideoStatus.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">任务进度</div>
                <div className="space-y-3 max-h-[400px] overflow-y-auto border rounded-lg p-4 bg-gray-50">
                  {batchVideoStatus.map((item) => (
                    <div key={item.shot_id} className="bg-white rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.shot_id}</Badge>
                          <Badge
                            variant={
                              item.status === 'uploaded' || item.status === 'completed'
                                ? 'default'
                                : item.status === 'error'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {item.status === 'pending' && '等待中'}
                            {item.status === 'uploading' && '上传中'}
                            {item.status === 'uploaded' && '已上传'}
                            {item.status === 'generating' && '生成中'}
                            {item.status === 'completed' && '已完成'}
                            {item.status === 'error' && '失败'}
                          </Badge>
                        </div>
                      </div>

                      {/* 图片预览 */}
                      {item.imageUrl && (
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-24 h-36 bg-gray-100 rounded overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt={item.shot_id}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="text-xs text-gray-500">提示词</div>
                            <div className="text-sm">{item.prompt}</div>
                            {item.videoTaskNumber && (
                              <div className="text-xs text-gray-500">
                                任务编号: #{item.videoTaskNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 上传进度 */}
                      {(item.status === 'uploading' || item.status === 'pending') && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>上传进度</span>
                            <span>{item.progress}%</span>
                          </div>
                          <Progress value={item.progress} className="h-2" />
                        </div>
                      )}

                      {/* 错误信息 */}
                      {item.error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{item.error}</AlertDescription>
                        </Alert>
                      )}

                      {/* R2 URL */}
                      {item.r2Url && (
                        <div className="text-xs text-gray-500 truncate" title={item.r2Url}>
                          R2 URL:{' '}
                          <a
                            href={item.r2Url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline-offset-2 hover:underline"
                          >
                            {formatUrlDisplay(item.r2Url)}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {createdTaskNumbers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>本次生成的任务编号:</span>
                <div className="flex flex-wrap gap-2">
                  {createdTaskNumbers.map((number) => (
                    <Badge key={number} variant="secondary">
                      #{number}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-lg">
              <VideoTaskBoard
                variant="embedded"
                showCreateButton={false}
                showGenerateButton
                highlightNumbers={createdTaskNumbers}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
