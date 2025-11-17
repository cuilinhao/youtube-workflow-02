'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2Icon, FilmIcon, PlayCircleIcon, CropIcon, RotateCcwIcon, CheckSquareIcon } from 'lucide-react';
import { api, VideoTask } from '@/lib/api';
import { cn } from '@/lib/utils';
import { VIDEO_ASPECT_RATIO_OPTIONS } from '@/constants/video';
import { VideoTaskForm, VideoTaskFormSubmitPayload, createEmptyVideoTaskDraft } from './video-task-form';

/**
 * 状态颜色配置
 * 为不同的任务状态定义渐变色样式，增强视觉效果
 */
const STATUS_COLOR: Record<string, string> = {
  等待中: 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border border-slate-300 shadow-sm',
  生成中: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md animate-pulse',
  下载中: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-md',
  成功: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 shadow-md',
  失败: 'bg-gradient-to-r from-rose-500 to-red-500 text-white border-0 shadow-md',
  提交中: 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white border-0 shadow-md',
};

/**
 * 视频生成服务商选项配置
 * 支持多个AI视频生成平台
 */
const VIDEO_PROVIDER_OPTIONS = [
  { value: 'kie-veo3-fast', label: 'KIE · Veo3 Fast' },
  { value: 'yunwu-veo3-fast', label: '云雾 · Veo3 Fast' },
  { value: 'yunwu-veo3.1-fast', label: '云雾 · Veo3.1 Fast' },
  { value: 'yunwu-sora2', label: '云雾 · Sora 2' },
] as const;

type VideoProviderOption = (typeof VIDEO_PROVIDER_OPTIONS)[number]['value'];

/**
 * VideoTaskBoard 组件属性接口
 * @property {string} variant - 显示变体：'default' 或 'embedded'
 * @property {boolean} showCreateButton - 是否显示创建任务按钮
 * @property {boolean} showGenerateButton - 是否显示生成视频按钮
 * @property {string[]} highlightNumbers - 需要高亮显示的任务编号列表
 * @property {string} className - 自定义CSS类名
 */
interface VideoTaskBoardProps {
  variant?: 'default' | 'embedded';
  showCreateButton?: boolean;
  showGenerateButton?: boolean;
  highlightNumbers?: string[];
  className?: string;
}

/**
 * 更新画幅比例的参数接口
 */
interface UpdateAspectRatioVariables {
  numbers: string[]; // 要更新的任务编号列表
  aspectRatio: string; // 新的画幅比例
  regenerate?: boolean; // 是否重新生成视频
}

/**
 * 从URL或路径中提取文件名
 * @param {string} raw - 原始URL或路径字符串
 * @returns {string} 提取的文件名
 */
function getFileName(raw?: string | null) {
  if (!raw) return '';

  try {
    // 尝试作为URL解析
    const parsed = new URL(raw);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const segments = decodedPath.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // 如果不是有效URL，则按路径方式解析
  }

  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

/**
 * 获取用于显示的文件名或默认值
 * @param {string} raw - 原始URL或路径字符串
 * @returns {string} 显示用的文件名或"—"
 */
function getDisplayValue(raw?: string | null) {
  if (!raw) return '—';
  const name = getFileName(raw);
  return name || raw;
}

/**
 * 从完整路径中提取目录路径
 * @param {string} raw - 原始路径字符串
 * @returns {string} 目录路径
 */
function getDirectoryPath(raw?: string | null) {
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const segments = normalized.split('/');
  segments.pop(); // 移除文件名
  return segments.join('/');
}

/**
 * 批量图生视频任务看板组件
 *
 * 功能特性：
 * - 展示视频任务列表，支持选择、删除、批量操作
 * - 显示任务状态、进度、错误信息
 * - 支持修改画幅比例、重新生成视频
 * - 右侧预览区域展示已生成的视频，支持点击播放
 * - 自动轮询更新正在生成的任务状态
 *
 * @param {VideoTaskBoardProps} props - 组件属性
 */
export function VideoTaskBoard({
  variant = 'default',
  showCreateButton = true,
  showGenerateButton = true,
  highlightNumbers = [],
  className,
}: VideoTaskBoardProps = {}) {
  const queryClient = useQueryClient();

  // 获取视频任务列表数据，对于正在生成的任务每5秒自动刷新
  const { data: videoData, isLoading } = useQuery({
    queryKey: ['video-tasks'],
    queryFn: api.getVideoTasks,
    refetchInterval: (query) => {
      const running = (query.state.data?.videoTasks as VideoTask[] | undefined)?.some((task) =>
        ['生成中', '任务已提交，等待处理...', '生成完成，开始下载...'].includes(task.status),
      );
      return running ? 5000 : false;
    },
  });

  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  // 从查询结果中提取视频任务列表
  const videoTasks = useMemo(() => videoData?.videoTasks ?? [], [videoData]);

  // 选中的任务编号集合，用于批量操作
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 正在编辑的提示词状态
  const [editingPrompt, setEditingPrompt] = useState<
    | {
        number: string; // 任务编号
        value: string; // 当前编辑值
        original: string; // 原始值
      }
    | null
  >(null);

  // 提示词编辑取消标记（用于处理失焦事件）
  const promptCancelRef = useRef(false);

  // 是否正在选择输出文件夹
  const [isSelectingOutput, setIsSelectingOutput] = useState(false);

  // 画幅比例修改对话框状态
  const [isAspectDialogOpen, setIsAspectDialogOpen] = useState(false);

  // 待应用的画幅比例
  const [pendingAspectRatio, setPendingAspectRatio] = useState('');

  const initialFormValues = useMemo(
    () =>
      createEmptyVideoTaskDraft({
        aspectRatio: settings?.videoSettings.defaultAspectRatio,
        watermark: settings?.videoSettings.defaultWatermark,
        callbackUrl: settings?.videoSettings.defaultCallback,
        enableFallback: settings?.videoSettings.enableFallback,
        enableTranslation: settings?.videoSettings.enableTranslation,
      }),
    [settings],
  );

  const [activePage, setActivePage] = useState<'tasks' | 'create'>('tasks');
  const [formResetKey, setFormResetKey] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<VideoProviderOption>('kie-veo3-fast');
  const isEmbedded = variant === 'embedded';
  const highlightSet = useMemo(() => new Set(highlightNumbers), [highlightNumbers]);

  useEffect(() => {
    if (!showCreateButton && activePage !== 'tasks') {
      setActivePage('tasks');
    }
  }, [showCreateButton, activePage]);

  const containerClassName = cn('space-y-6', isEmbedded && 'space-y-4', className);

  /**
   * 添加视频任务的 mutation
   * 逐个创建视频任务，并在全部完成后刷新任务列表
   */
  const addTaskMutation = useMutation({
    mutationFn: async (payload: VideoTaskFormSubmitPayload) => {
      const results: Awaited<ReturnType<typeof api.addVideoTask>>[] = [];

      // 遍历所有任务行，逐个创建任务
      for (let index = 0; index < payload.rows.length; index += 1) {
        const row = payload.rows[index];
        const imageUrls = row.imageUrl ? [row.imageUrl] : [];
        const taskPayload = {
          prompt: row.prompt,
          imageUrls,
          aspectRatio: payload.aspectRatio,
          watermark: payload.watermark,
          callbackUrl: payload.callbackUrl,
          seeds: payload.seeds,
          enableFallback: payload.enableFallback,
          enableTranslation: payload.enableTranslation,
        };

        console.log('[VideoTaskBoard] 创建任务', { index: index + 1, taskPayload });
        const result = await api.addVideoTask(taskPayload);
        results.push(result);
      }

      console.log('[VideoTaskBoard] 任务创建完成', results);
      return results;
    },
    onSuccess: async (results) => {
      const count = results?.length || 0;
      toast.success(`已添加 ${count} 个视频任务`);
      // 刷新任务列表
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });
      // 重置表单并返回任务列表页面
      setFormResetKey((prev) => prev + 1);
      setActivePage('tasks');
    },
    onError: (error: Error) => toast.error(error.message || '添加视频任务失败'),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (number: string) => api.removeVideoTask(number),
    onSuccess: () => {
      toast.success('视频任务已删除');
      queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      setSelected(new Set());
    },
    onError: (error: Error) => toast.error(error.message || '删除视频任务失败'),
  });

  const clearTasksMutation = useMutation({
    mutationFn: api.clearVideoTasks,
    onSuccess: () => {
      toast.success('已清空视频任务');
      queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      setSelected(new Set());
    },
    onError: (error: Error) => toast.error(error.message || '清空视频任务失败'),
  });

  const generateMutation = useMutation({
    mutationFn: ({ numbers, provider }: { numbers?: string[]; provider: VideoProviderOption }) =>
      api.startVideoGeneration({
        numbers: numbers && numbers.length ? numbers : undefined,
        provider,
      }),
    onSuccess: (response) => {
      if (response.success) {
        toast.success('视频任务已提交');
        queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      } else {
        toast.info(response.message ?? '没有待生成的视频任务');
      }
    },
    onError: (error: Error) => toast.error(error.message || '启动图生视频失败'),
  });

  const updateAspectRatioMutation = useMutation<VideoTask[], Error, UpdateAspectRatioVariables>({
    mutationFn: async ({ numbers, aspectRatio }: UpdateAspectRatioVariables) => {
      if (!numbers.length) return [];
      const response = await api.updateVideoTasks(numbers, {
        updates: { aspectRatio },
        resetGeneration: true,
      });
      return response.tasks ?? [];
    },
    onSuccess: async (tasks, variables) => {
      const count = variables.numbers.length;
      toast.success(`已更新 ${count} 个任务的画幅比例为 ${variables.aspectRatio}`);
      setIsAspectDialogOpen(false);
      setPendingAspectRatio('');
      if (tasks?.length) {
        const updatedMap = new Map(tasks.map((task) => [task.number, task]));
        queryClient.setQueryData<{ videoTasks: VideoTask[] } | undefined>(['video-tasks'], (previous) => {
          if (!previous) return previous;
          const nextVideoTasks = previous.videoTasks.map((task) => updatedMap.get(task.number) ?? task);
          return { ...previous, videoTasks: nextVideoTasks };
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });
      if (variables.regenerate && count) {
        generateMutation.mutate({
          numbers: variables.numbers,
          provider: selectedProvider,
        });
      }
    },
    onError: (error: Error) => toast.error(error.message || '更新画幅比例失败'),
  });

  // Reuse相同的重置字段，确保 UI 与服务端保持一致。
  const createResetPayload = (): Partial<VideoTask> => ({
    status: '等待中',
    progress: 0,
    remoteUrl: null,
    localPath: null,
    errorMsg: null,
    providerRequestId: null,
    actualFilename: null,
    fingerprint: null,
    finishedAt: null,
    startedAt: null,
    attempts: 0,
  });

  const resetTasksMutation = useMutation<
    { success: boolean; task: VideoTask }[],
    Error,
    VideoTask[],
    { previous?: { videoTasks: VideoTask[] } }
  >({
    mutationFn: async (tasks: VideoTask[]) => {
      if (!tasks.length) return [];
      const resetPayload = createResetPayload();
      return Promise.all(tasks.map((task) => api.updateVideoTask(task.number, resetPayload)));
    },
    onMutate: async (tasks) => {
      if (!tasks.length) return undefined;
      await queryClient.cancelQueries({ queryKey: ['video-tasks'] });
      const previous = queryClient.getQueryData<{ videoTasks: VideoTask[] }>(['video-tasks']);
      if (previous) {
        // 立即在前端清空错误信息，提供秒级的反馈体验。
        const resetPayload = createResetPayload();
        const numbers = new Set(tasks.map((task) => task.number));
        const next = previous.videoTasks.map((task) =>
          numbers.has(task.number) ? { ...task, ...resetPayload } : task,
        );
        queryClient.setQueryData(['video-tasks'], { videoTasks: next });
      }
      return { previous };
    },
    onSuccess: async (_results, tasks) => {
      const numbers = tasks.map((task) => task.number);
      toast.success(`已重置 ${numbers.length} 个任务，准备重新生成`);
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });
      if (numbers.length) {
        generateMutation.mutate({
          numbers,
          provider: selectedProvider,
        });
      }
    },
    onError: (error: Error, _tasks, context) => {
      if (context?.previous) {
        // 若写入失败，将列表回滚至原始状态，避免展示脏数据。
        queryClient.setQueryData(['video-tasks'], context.previous);
      }
      toast.error(error.message || '重置任务失败');
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: ({ number, prompt }: { number: string; prompt: string }) =>
      api.updateVideoTask(number, { prompt }),
    onSuccess: async () => {
      toast.success('提示词已更新');
      setEditingPrompt(null);
      promptCancelRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
    },
    onError: (error: Error) => toast.error(error.message || '更新提示词失败'),
  });

  const updateSavePathMutation = useMutation({
    mutationFn: (savePath: string) => api.updateSettings({ videoSettings: { savePath } }),
    onSuccess: async (_, savePath) => {
      toast.success(`已更新视频存储路径：${savePath}`);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message || '更新存储路径失败'),
  });

  const sortedTasks = useMemo(
    () =>
      [...videoTasks].sort((a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10)),
    [videoTasks],
  );
  const selectedTasks = useMemo(
    () => sortedTasks.filter((task) => selected.has(task.number)),
    [sortedTasks, selected],
  );
  const selectedNumbers = useMemo(() => Array.from(selected), [selected]);
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const valid = new Set(sortedTasks.map((task) => task.number));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((number) => {
        if (valid.has(number)) {
          next.add(number);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sortedTasks]);
  const areAllVisibleTasksSelected = useMemo(
    () => sortedTasks.length > 0 && sortedTasks.every((task) => selected.has(task.number)),
    [sortedTasks, selected],
  );
  const hasMixedSelectedAspectRatios = useMemo(() => {
    if (selectedTasks.length <= 1) return false;
    const unique = new Set(selectedTasks.map((task) => task.aspectRatio));
    return unique.size > 1;
  }, [selectedTasks]);

  const overallProgress = useMemo(() => {
    if (!videoTasks.length) return 0;
    const total = videoTasks.reduce((acc, task) => acc + (task.status === '成功' ? 100 : task.progress ?? 0), 0);
    return Math.round(total / videoTasks.length);
  }, [videoTasks]);

  const handleSelect = (number: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(number);
      } else {
        next.delete(number);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelected((prev) => {
      const allSelected = sortedTasks.every((task) => prev.has(task.number));
      if (allSelected) {
        return new Set<string>();
      }
      return new Set(sortedTasks.map((task) => task.number));
    });
  };

  const handleDeleteSelected = () => {
    if (!selected.size) {
      toast.warning('请先选择要删除的任务');
      return;
    }
    selected.forEach((number) => deleteTaskMutation.mutate(number));
  };

  const handleStartGeneration = () => {
    const numbers = selected.size ? Array.from(selected) : undefined;
    const targets = numbers && numbers.length ? sortedTasks.filter((task) => numbers.includes(task.number)) : sortedTasks;
    const actionableStatuses = new Set(['等待中', '失败', '提交中', '生成中']);
    const actionableTasks = targets.filter((task) => actionableStatuses.has(task.status));

    if (!actionableTasks.length) {
      toast.info('没有可提交的任务');
      return;
    }

    if (selectedProvider !== 'yunwu-sora2') {
      const missingImages = actionableTasks.filter((task) => !(task.imageUrls && task.imageUrls[0]));
      if (missingImages.length) {
        toast.error(`以下任务缺少参考图：${missingImages.map((task) => task.number).join('、')}，请补充后再试。`);
        return;
      }
    } else {
      const missingPrompts = actionableTasks.filter((task) => !task.prompt?.trim());
      if (missingPrompts.length) {
        toast.error(`以下任务缺少提示词：${missingPrompts.map((task) => task.number).join('、')}，请补充后再试。`);
        return;
      }
    }

    generateMutation.mutate({ numbers, provider: selectedProvider });
  };

  const handleRegenerateTask = (task: VideoTask) => {
    if (resetTasksMutation.isPending) return;
    if (['生成中', '下载中', '提交中'].includes(task.status)) {
      toast.info('任务正在处理中，请稍后再试');
      return;
    }
    resetTasksMutation.mutate([task]);
  };

  const handleRegenerateSelected = () => {
    if (!selectedNumbers.length) {
      toast.warning('请先选择要重新生成的任务');
      return;
    }
    if (!selectedTasks.length) {
      toast.warning('所选任务暂未加载完成，请稍后重试');
      return;
    }
    if (resetTasksMutation.isPending) {
      return;
    }
    resetTasksMutation.mutate(selectedTasks);
  };

  const handleOpenAspectDialog = () => {
    if (!selectedNumbers.length) {
      toast.warning('请先选择要修改的任务');
      return;
    }
    if (!selectedTasks.length) {
      toast.warning('所选任务暂未加载完成，请稍后再试');
      return;
    }
    if (updateAspectRatioMutation.isPending) return;
    const unique = new Set(selectedTasks.map((task) => task.aspectRatio).filter(Boolean));
    const fallbackRatio = settings?.videoSettings.defaultAspectRatio ?? '9:16';
    const nextRatio = unique.size === 1 ? selectedTasks[0]?.aspectRatio ?? fallbackRatio : fallbackRatio;
    setPendingAspectRatio(nextRatio);
    setIsAspectDialogOpen(true);
  };

  const handleAspectDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (updateAspectRatioMutation.isPending) return;
      setIsAspectDialogOpen(false);
      setPendingAspectRatio('');
    } else {
      setIsAspectDialogOpen(true);
    }
  };

  const handleAspectRatioSubmit = (action: 'update' | 'update-and-regenerate') => {
    if (!selectedNumbers.length) {
      toast.warning('请先选择要修改的任务');
      return;
    }
    if (!pendingAspectRatio) {
      toast.warning('请选择画幅比例');
      return;
    }
    updateAspectRatioMutation.mutate({
      numbers: selectedNumbers,
      aspectRatio: pendingAspectRatio,
      regenerate: action === 'update-and-regenerate',
    });
  };

  const startEditingPrompt = (task: VideoTask) => {
    promptCancelRef.current = false;
    setEditingPrompt({
      number: task.number,
      value: task.prompt ?? '',
      original: task.prompt ?? '',
    });
  };

  const handlePromptChange = (value: string) => {
    setEditingPrompt((prev) => (prev ? { ...prev, value } : prev));
  };

  const commitPromptChange = () => {
    if (!editingPrompt) return;
    const trimmed = editingPrompt.value.trim();
    const originalTrimmed = editingPrompt.original.trim();

    if (trimmed === originalTrimmed) {
      setEditingPrompt(null);
      promptCancelRef.current = false;
      return;
    }

    updatePromptMutation.mutate({ number: editingPrompt.number, prompt: trimmed });
  };

  const handlePromptBlur = () => {
    if (promptCancelRef.current) {
      promptCancelRef.current = false;
      return;
    }

    commitPromptChange();
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      promptCancelRef.current = true;
      setEditingPrompt(null);
      return;
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitPromptChange();
    }
  };

  const handleOutputFolderButtonClick = async () => {
    if (isSelectingOutput) return;
    try {
      setIsSelectingOutput(true);
      const response = await fetch('/api/system/select-folder', { method: 'POST' });
      const data = (await response.json()) as { success: boolean; path?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message || '选择文件夹失败');
      }

      if (!data.success || !data.path) {
        if (data.message) {
          toast.info(data.message);
        }
        return;
      }

      updateSavePathMutation.mutate(data.path);
    } catch (error) {
      toast.error((error as Error).message || '选择文件夹失败');
    } finally {
      setIsSelectingOutput(false);
    }
  };

  const handleOpenOutputLocation = async (task: VideoTask) => {
    const location = task.localPath ?? task.remoteUrl;
    if (!location) {
      toast.info('该任务尚未生成视频文件');
      return;
    }

    if (/^https?:/i.test(location)) {
      window.open(location, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const result = await api.openFolder(location);
      if (!result.success) {
        throw new Error(result.message || '打开文件夹失败');
      }

      if (result.directory && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(result.directory).catch(() => {
          /* clipboard unavailable */
        });
      }
      toast.success(`已打开文件所在文件夹${result.directory ? `：${result.directory}` : ''}`);
    } catch (error) {
      const directory = getDirectoryPath(location);
      if (directory && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(directory).catch(() => {
          /* clipboard unavailable */
        });
      }
      toast.error((error as Error).message || '打开文件夹失败');
    }
  };

  const handleFormSubmit = (payload: VideoTaskFormSubmitPayload) => {
    if (!payload.rows.length) {
      toast.warning('请至少添加一行任务');
      return;
    }
    addTaskMutation.mutate(payload);
  };

  // 视频播放状态 - 记录当前正在播放的视频任务编号
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  return (
    <div className={containerClassName}>
      {activePage === 'tasks' ? (
        <Card className={cn(isEmbedded ? 'shadow-none border-0' : 'shadow-xl border-0 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white')}>
          <CardHeader className="space-y-6 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-b border-slate-200/50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
                  🎬 图生视频任务
                </CardTitle>
                <CardDescription className="text-base text-slate-600">批量生成 Veo3 视频任务列表</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-4 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    <span className="text-sm font-semibold text-slate-700">总数 <span className="text-slate-900">{videoTasks.length}</span></span>
                  </div>
                  <div className="w-px h-4 bg-slate-200"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm font-semibold text-emerald-700">成功 <span className="text-emerald-800">{videoTasks.filter((item) => item.status === '成功').length}</span></span>
                  </div>
                  <div className="w-px h-4 bg-slate-200"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <span className="text-sm font-semibold text-rose-700">失败 <span className="text-rose-800">{videoTasks.filter((item) => item.status === '失败').length}</span></span>
                  </div>
                </div>
                {showCreateButton && (
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6"
                    onClick={() => setActivePage('create')}
                  >
                    <span className="font-semibold">+ 添加任务</span>
                  </Button>
                )}
              </div>
            </div>

            {/* 操作按钮区域 */}
            <div className="space-y-3">
              {/* 第一行：选择和删除操作 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/70 backdrop-blur-sm rounded-lg border border-slate-200">
                  <span className="text-xs font-medium text-slate-600">批量操作</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleToggleSelectAll}
                  disabled={!sortedTasks.length}
                  className="hover:bg-slate-100 transition-colors"
                >
                  <CheckSquareIcon className="mr-1.5 h-3.5 w-3.5" />
                  {areAllVisibleTasksSelected ? '取消全选' : '选中全部'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={!selected.size || resetTasksMutation.isPending}
                  className="hover:bg-rose-50 hover:text-rose-700 transition-colors"
                >
                  <Trash2Icon className="mr-1.5 h-3.5 w-3.5" /> 删除选中
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => clearTasksMutation.mutate()}
                  disabled={!videoTasks.length}
                  className="hover:bg-rose-50 hover:text-rose-700 transition-colors"
                >
                  <Trash2Icon className="mr-1.5 h-3.5 w-3.5" /> 清空全部
                </Button>
              </div>

              {/* 第二行：任务操作和生成 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/70 backdrop-blur-sm rounded-lg border border-slate-200">
                  <span className="text-xs font-medium text-slate-600">任务操作</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenAspectDialog}
                  disabled={!selectedNumbers.length || updateAspectRatioMutation.isPending || resetTasksMutation.isPending}
                  className="bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all"
                >
                  <CropIcon className="mr-1.5 h-3.5 w-3.5" /> 修改画幅
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateSelected}
                  disabled={!selectedNumbers.length || resetTasksMutation.isPending}
                  className="bg-white hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all"
                >
                  <RotateCcwIcon className="mr-1.5 h-3.5 w-3.5" /> 重新生成选中
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOutputFolderButtonClick}
                  disabled={updateSavePathMutation.isPending || isSelectingOutput}
                  className="bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-all"
                >
                  视频存储文件夹
                </Button>

                {showGenerateButton && (
                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white/90 backdrop-blur-sm px-4 py-2 shadow-sm">
                      <span className="text-sm font-semibold text-slate-700">模型</span>
                      <Select
                        value={selectedProvider}
                        onValueChange={(value) => setSelectedProvider(value as VideoProviderOption)}
                        disabled={generateMutation.isPending || resetTasksMutation.isPending}
                      >
                        <SelectTrigger className="h-9 w-[180px] border-slate-300 bg-white">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                          {VIDEO_PROVIDER_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-5"
                      disabled={generateMutation.isPending || resetTasksMutation.isPending}
                      onClick={handleStartGeneration}
                    >
                      <PlayCircleIcon className="mr-2 h-4 w-4" />
                      <span className="font-semibold">开始生成视频</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/50 to-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg">
                    <FilmIcon className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-800">当前批次整体进度</div>
                    <div className="text-xs text-slate-500 mt-0.5">总体任务完成情况</div>
                  </div>
                </div>
                <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                  <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">{overallProgress}%</span>
                </div>
              </div>
              <div className="relative">
                <Progress value={overallProgress} className="h-3 bg-slate-200" />
              </div>
            </div>

            {/* 任务卡片列表 - 可滚动展示 */}
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {/* 加载状态 */}
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <FilmIcon className="h-16 w-16 mb-4 opacity-20 animate-pulse" />
                    <p className="text-sm">正在加载视频任务...</p>
                  </div>
                ) : !sortedTasks.length ? (
                  /* 空状态 */
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <FilmIcon className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-sm">
                      {showCreateButton
                        ? '暂无视频任务，请点击右上角的"添加任务"。'
                        : '暂无视频任务，请先通过工作流批量上传并生成任务。'}
                    </p>
                  </div>
                ) : (
                  /* 任务卡片列表 - 每个卡片包含视频预览、任务信息、状态等 */
                  sortedTasks.map((task) => {
                    // 获取视频URL（优先使用远程URL，因为本地路径无法在浏览器播放）
                    const videoUrl = task.remoteUrl || task.localPath;
                    // 判断当前是否正在播放该视频
                    const isPlaying = playingVideo === task.number;
                    // 检查是否是可播放的HTTP URL
                    const isPlayableUrl = videoUrl && /^https?:\/\//i.test(videoUrl);
                    // 判断是否有可播放的视频（状态为成功且有可播放URL）
                    const hasVideo = task.status === '成功' && isPlayableUrl;

                    return (
                      <div
                        key={task.number}
                        className={cn(
                          'group relative rounded-2xl border-2 overflow-hidden transition-all duration-200 bg-white',
                          highlightSet.has(task.number)
                            ? 'border-purple-400 shadow-lg shadow-purple-200'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
                        )}
                      >
                        {/* 任务卡片网格布局 */}
                        <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-4">
                          {/* 左侧：选择框和编号 */}
                          <div className="flex flex-col items-center gap-3">
                            <Checkbox
                              checked={selected.has(task.number)}
                              onCheckedChange={(checked) => handleSelect(task.number, Boolean(checked))}
                              className="mt-1"
                            />
                            <div className="px-3 py-1.5 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg">
                              <span className="text-sm font-bold text-slate-800">{task.number}</span>
                            </div>
                          </div>

                          {/* 中间：视频预览和任务信息 */}
                          <div className="grid grid-cols-[300px_1fr] gap-4">
                            {/* 视频预览区 */}
                            <div
                              className={cn(
                                'relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer',
                                isPlaying
                                  ? 'border-purple-500 shadow-lg shadow-purple-500/30'
                                  : 'border-slate-200 hover:border-purple-300',
                              )}
                              onClick={() => {
                                if (hasVideo) {
                                  console.log('[VideoTaskBoard] 点击播放视频', {
                                    number: task.number,
                                    videoUrl,
                                    localPath: task.localPath,
                                    remoteUrl: task.remoteUrl
                                  });
                                  setPlayingVideo(isPlaying ? null : task.number);
                                }
                              }}
                            >
                              <div className="relative aspect-video bg-gradient-to-br from-slate-900 to-slate-800">
                                {isPlaying && videoUrl ? (
                                  /* 视频播放器 */
                                  <video
                                    src={videoUrl}
                                    controls
                                    autoPlay
                                    loop
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                      console.error('[VideoTaskBoard] 视频加载失败', {
                                        number: task.number,
                                        videoUrl,
                                        error: e,
                                      });
                                      toast.error(`视频 #${task.number} 加载失败，请检查文件路径`);
                                    }}
                                    onLoadedData={() => {
                                      console.log('[VideoTaskBoard] 视频加载成功', { number: task.number, videoUrl });
                                    }}
                                  />
                                ) : (
                                  <>
                                    {/* 占位图片 */}
                                    <img
                                      src="/aaa.jpg"
                                      alt="视频预览"
                                      className="w-full h-full object-cover"
                                    />
                                    {/* 播放按钮遮罩（仅成功的视频显示） */}
                                    {hasVideo && (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                                          <PlayCircleIcon className="h-8 w-8 text-white" />
                                        </div>
                                      </div>
                                    )}
                                    {/* 右上角AI生成标签 */}
                                    {hasVideo && (
                                      <div className="absolute top-2 right-2 px-2.5 py-1 bg-black/80 backdrop-blur-sm rounded-lg text-xs font-bold text-white">
                                        AI生成
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* 任务详细信息 */}
                            <div className="space-y-3">
                              {/* 画幅比例 */}
                              <div className="flex items-center gap-2">
                                <CropIcon className="h-4 w-4 text-slate-500" />
                                <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                                  {task.aspectRatio || '9:16'}
                                </span>
                              </div>

                              {/* 提示词编辑区 */}
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-600">提示词</label>
                                {editingPrompt?.number === task.number ? (
                                  <Textarea
                                    value={editingPrompt.value}
                                    onChange={(event) => handlePromptChange(event.target.value)}
                                    onBlur={handlePromptBlur}
                                    onKeyDown={handlePromptKeyDown}
                                    rows={4}
                                    autoFocus
                                    className="text-sm border-2 border-purple-300 focus:border-purple-500"
                                    disabled={updatePromptMutation.isPending}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className="w-full text-left text-sm text-slate-700 hover:bg-slate-100 p-3 rounded-lg transition-colors line-clamp-3 leading-relaxed"
                                    title={task.prompt || '点击编辑提示词'}
                                    onClick={() => startEditingPrompt(task)}
                                  >
                                    {task.prompt || <span className="text-slate-400">点击添加提示词</span>}
                                  </button>
                                )}
                              </div>

                              {/* 错误信息（如果有）*/}
                              {task.errorMsg && (
                                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                                  <span className="text-rose-600 text-sm">⚠️</span>
                                  <p className="text-xs text-rose-700 leading-relaxed flex-1" title={task.errorMsg}>
                                    {task.errorMsg}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 右侧：状态和进度 */}
                          <div className="flex flex-col items-end gap-3">
                            {/* 状态徽章 */}
                            <Badge className={cn('font-semibold text-xs px-4 py-2 rounded-xl', STATUS_COLOR[task.status] ?? 'bg-slate-100 text-slate-700')}>
                              {task.status}
                            </Badge>

                            {/* 进度条 */}
                            <div className="w-24 space-y-2">
                              <Progress value={task.status === '成功' ? 100 : task.progress ?? 0} className="h-2" />
                              <div className="text-center">
                                <span className={cn('text-xs font-bold', task.status === '成功' ? 'text-emerald-600' : 'text-slate-600')}>
                                  {task.status === '成功' ? '✓ 100%' : `${task.progress ?? 0}%`}
                                </span>
                              </div>
                            </div>

                            {/* 查看文件 & 重新生成 */}
                            {(task.localPath || task.remoteUrl) && (
                              <div className="flex flex-col items-end gap-2 w-full">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-blue-600 bg-blue-50/50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                                  title={`点击查看视频文件：${getDisplayValue(task.localPath ?? task.remoteUrl)}`}
                                  onClick={() => handleOpenOutputLocation(task)}
                                >
                                  📁 查看文件
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-purple-600 bg-purple-50/60 px-4 py-2 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                  title="重新生成该视频任务"
                                  onClick={() => handleRegenerateTask(task)}
                                  disabled={resetTasksMutation.isPending}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <RotateCcwIcon className="h-3.5 w-3.5" />
                                    重新生成视频
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card className={cn(isEmbedded ? 'shadow-none border-0' : 'shadow-xl border-0 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white')}>
          <CardHeader className="space-y-4 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-b border-slate-200/50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  ✨ 新建图生视频任务
                </CardTitle>
                <CardDescription className="text-base text-slate-600">
                  填写 Veo3 视频提示词与参考图，一个图片对应一个任务
                  {isSettingsLoading ? ' (正在读取默认设置...)' : ''}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePage('tasks')}
                className="bg-white hover:bg-slate-50 border-slate-300 shadow-sm"
              >
                ← 返回任务列表
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="min-h-[500px]">
              <VideoTaskForm
                key={formResetKey}
                mode="create"
                initialValues={initialFormValues}
                onSubmit={handleFormSubmit}
                isSubmitting={addTaskMutation.isPending}
                submitLabel={addTaskMutation.isPending ? '提交中...' : '添加任务'}
                disableUpload={isSettingsLoading}
              />
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={isAspectDialogOpen} onOpenChange={handleAspectDialogOpenChange}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-white to-slate-50 border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              📐 批量修改画幅比例
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              将对已选择的 <span className="font-bold text-purple-600">{selectedNumbers.length}</span> 个任务应用新的画幅比例，并清空对应生成结果。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Select value={pendingAspectRatio} onValueChange={setPendingAspectRatio}>
                <SelectTrigger className="h-11 border-2 border-slate-200 hover:border-purple-300 transition-colors">
                  <SelectValue placeholder="选择画幅比例" />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasMixedSelectedAspectRatios ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-600">⚠️</span>
                  <p className="text-xs text-amber-700 leading-relaxed">当前所选任务画幅不一致，默认使用设置中心中的画幅。</p>
                </div>
              ) : null}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-blue-600">ℹ️</span>
                <p className="text-xs text-blue-700 leading-relaxed">
                  更新画幅后，任务会重置为等待中状态，同时移除本地与远程的生成文件记录。
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleAspectDialogOpenChange(false)}
              disabled={updateAspectRatioMutation.isPending}
              className="hover:bg-slate-100"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAspectRatioSubmit('update')}
              disabled={updateAspectRatioMutation.isPending}
              className="bg-slate-100 hover:bg-slate-200"
            >
              更新画幅
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg"
              onClick={() => handleAspectRatioSubmit('update-and-regenerate')}
              disabled={updateAspectRatioMutation.isPending}
            >
              更新并重新生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
