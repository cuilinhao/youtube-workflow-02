import { useState, useCallback, useRef } from 'react';
import { generateVideoClient, pollVideoGeneration } from '@/lib/video-generation-client';
import type { VideoTask } from '@/lib/types';
import { api } from '@/lib/api';

interface UseVideoGenerationOptions {
  apiKey: string;
  onProgress?: (taskNumber: string, progress: number, status: string) => void;
  onComplete?: (taskNumber: string, videoUrl: string) => void;
  onError?: (taskNumber: string, error: string) => void;
}

interface GenerationState {
  [taskNumber: string]: {
    isGenerating: boolean;
    progress: number;
    status: string;
  };
}

export function useVideoGeneration(options: UseVideoGenerationOptions) {
  const [state, setState] = useState<GenerationState>({});
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const updateTaskState = useCallback(
    (taskNumber: string, updates: Partial<GenerationState[string]>) => {
      setState((prev) => ({
        ...prev,
        [taskNumber]: { ...prev[taskNumber], ...updates },
      }));
    },
    [],
  );

  const generateVideo = useCallback(
    async (task: VideoTask) => {
      const { number, prompt, imageUrls, aspectRatio, watermark, callbackUrl, seeds, enableFallback, enableTranslation } =
        task;

      updateTaskState(number, {
        isGenerating: true,
        progress: 5,
        status: '开始生成...',
      });

      await api.updateVideoTask(number, {
        status: '生成中',
        progress: 5,
        errorMsg: '',
      });

      try {
        const { taskId } = await generateVideoClient(options.apiKey, {
          prompt,
          imageUrls,
          aspectRatio,
          watermark: watermark || undefined,
          callBackUrl: callbackUrl || undefined,
          seeds: seeds ? Number.parseInt(seeds, 10) : undefined,
          enableFallback,
          enableTranslation,
        });

        updateTaskState(number, {
          progress: 15,
          status: '任务已提交，等待处理...',
        });

        await api.updateVideoTask(number, {
          status: '任务已提交，等待处理...',
          progress: 15,
        });

        const videoUrl = await pollVideoGeneration(
          options.apiKey,
          taskId,
          {
            onProgress: (progress, status) => {
              updateTaskState(number, { progress, status });
              options.onProgress?.(number, progress, status);
              api.updateVideoTask(number, { progress, status }).catch(console.error);
            },
            onComplete: async (url) => {
              updateTaskState(number, {
                isGenerating: false,
                progress: 100,
                status: '成功',
              });
              options.onComplete?.(number, url);

              await api.updateVideoTask(number, {
                status: '下载中',
                progress: 95,
              });

              const downloadResponse = await fetch('/api/video-tasks/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number, url }),
              });

              if (!downloadResponse.ok) {
                throw new Error('下载视频失败');
              }

              const result = await downloadResponse.json();

              await api.updateVideoTask(number, {
                status: '成功',
                progress: 100,
                localPath: result.localPath,
                remoteUrl: url,
                actualFilename: result.filename,
                errorMsg: '',
              });
            },
            onError: (error) => {
              updateTaskState(number, {
                isGenerating: false,
                progress: task.progress ?? 0,
                status: '失败',
              });
              options.onError?.(number, error);
              api.updateVideoTask(number, { status: '失败', errorMsg: error }).catch(console.error);
            },
          },
          120,
          5000,
        );

        return videoUrl;
      } catch (error) {
        const errorMsg = (error as Error).message;
        updateTaskState(number, {
          isGenerating: false,
          progress: task.progress ?? 0,
          status: '失败',
        });
        options.onError?.(number, errorMsg);
        await api.updateVideoTask(number, { status: '失败', errorMsg });
        throw error;
      }
    },
    [options, updateTaskState],
  );

  const generateMultiple = useCallback(
    async (tasks: VideoTask[]) => {
      const results = await Promise.allSettled(tasks.map((task) => generateVideo(task)));

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        throw new Error(`${failed.length} 个视频任务失败`);
      }
    },
    [generateVideo],
  );

  const cancel = useCallback((taskNumber: string) => {
    const controller = abortControllersRef.current.get(taskNumber);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskNumber);
    }
    setState((prev) => {
      const next = { ...prev };
      delete next[taskNumber];
      return next;
    });
  }, []);

  const cancelAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    setState({});
  }, []);

  return {
    state,
    generateVideo,
    generateMultiple,
    cancel,
    cancelAll,
  };
}