'use client';

import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Trash2Icon, FilmIcon, PlayCircleIcon } from 'lucide-react';
import { api, VideoTask } from '@/lib/api';
import { cn } from '@/lib/utils';
import { VideoTaskForm, VideoTaskFormSubmitPayload, createEmptyVideoTaskDraft } from './video-task-form';

const STATUS_COLOR: Record<string, string> = {
  等待中: 'bg-slate-100 text-slate-700 border border-slate-200',
  生成中: 'bg-blue-100 text-blue-700 border border-blue-200',
  下载中: 'bg-amber-100 text-amber-700 border border-amber-200',
  成功: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  失败: 'bg-rose-100 text-rose-700 border border-rose-200',
  提交中: 'bg-sky-100 text-sky-700 border border-sky-200',
};

function getFileName(raw?: string | null) {
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const segments = decodedPath.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch (error) {
    // Not a valid URL, fall back to path-style parsing
  }

  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

function getDisplayValue(raw?: string | null) {
  if (!raw) return '—';
  const name = getFileName(raw);
  return name || raw;
}

function getDirectoryPath(raw?: string | null) {
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const segments = normalized.split('/');
  segments.pop();
  return segments.join('/');
}

export function VideoTaskBoard() {
  const queryClient = useQueryClient();
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

  const videoTasks = useMemo(() => videoData?.videoTasks ?? [], [videoData]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPrompt, setEditingPrompt] = useState<
    | {
        number: string;
        value: string;
        original: string;
      }
    | null
  >(null);
  const promptCancelRef = useRef(false);
  const [isSelectingOutput, setIsSelectingOutput] = useState(false);

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

  const addTaskMutation = useMutation({
    mutationFn: async (payload: VideoTaskFormSubmitPayload) => {
      const results: Awaited<ReturnType<typeof api.addVideoTask>>[] = [];

      for (let index = 0; index < payload.rows.length; index += 1) {
        const row = payload.rows[index];
        const taskPayload = {
          prompt: row.prompt,
          imageUrls: [row.imageUrl],
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
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['video-tasks'], type: 'active' });
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
    mutationFn: (numbers?: string[]) => api.startVideoGeneration(numbers?.length ? numbers : undefined),
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

  const handleDeleteSelected = () => {
    if (!selected.size) {
      toast.warning('请先选择要删除的任务');
      return;
    }
    selected.forEach((number) => deleteTaskMutation.mutate(number));
  };

  const handleStartGeneration = () => {
    generateMutation.mutate(selected.size ? Array.from(selected) : undefined);
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

  const handleOpenOutputLocation = (task: VideoTask) => {
    const location = task.localPath ?? task.remoteUrl;
    if (!location) {
      toast.info('该任务尚未生成视频文件');
      return;
    }

    if (/^https?:/i.test(location)) {
      window.open(location, '_blank', 'noopener,noreferrer');
      return;
    }

    const directory = getDirectoryPath(location);
    if (directory) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(directory).catch(() => {
          /* clipboard unavailable */
        });
      }
      toast.info(`视频文件位于：${directory}`);
    } else {
      toast.info(location);
    }
  };

  const handleFormSubmit = (payload: VideoTaskFormSubmitPayload) => {
    if (!payload.rows.length) {
      toast.warning('请至少添加一行任务');
      return;
    }
    addTaskMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      {activePage === 'tasks' ? (
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-semibold">🎬 图生视频任务</CardTitle>
                <CardDescription>批量生成 Veo3 视频任务列表</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>任务总数: {videoTasks.length}</span>
                  <span className="text-emerald-600">成功 {videoTasks.filter((item) => item.status === '成功').length}</span>
                  <span className="text-rose-600">失败 {videoTasks.filter((item) => item.status === '失败').length}</span>
                </div>
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => setActivePage('create')}
                >
                  添加任务
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={!selected.size}
              >
                <Trash2Icon className="mr-2 h-4 w-4" /> 删除选中
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => clearTasksMutation.mutate()}
                disabled={!videoTasks.length}
              >
                <Trash2Icon className="mr-2 h-4 w-4" /> 清空全部
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOutputFolderButtonClick}
                disabled={updateSavePathMutation.isPending || isSelectingOutput}
              >
                视频存储文件夹
              </Button>
              <Button
                size="sm"
                className="ml-auto bg-purple-600 hover:bg-purple-700"
                disabled={generateMutation.isPending}
                onClick={handleStartGeneration}
              >
                <PlayCircleIcon className="mr-2 h-4 w-4" /> 开始生成视频
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-3 text-sm font-medium text-slate-700">
                <FilmIcon className="h-4 w-4" /> 当前批次整体进度
              </div>
              <Progress value={overallProgress} className="h-2" />
              <div className="mt-2 text-xs text-muted-foreground">{overallProgress}%</div>
            </div>

            <ScrollArea className="h-[500px] rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100">
                    <TableHead className="w-12">选择</TableHead>
                    <TableHead className="w-16">编号</TableHead>
                    <TableHead className="w-36">参考图</TableHead>
                    <TableHead>提示词</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-20">进度</TableHead>
                    <TableHead className="w-44">生成文件</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        正在加载视频任务...
                      </TableCell>
                    </TableRow>
                  ) : !sortedTasks.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        暂无视频任务，请点击右上角的“添加任务”。
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTasks.map((task) => (
                      <TableRow key={task.number} className="text-sm">
                        <TableCell>
                          <Checkbox
                            checked={selected.has(task.number)}
                            onCheckedChange={(checked) => handleSelect(task.number, Boolean(checked))}
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-slate-700">{task.number}</TableCell>
                        <TableCell className="max-w-[180px]">
                          {task.imageUrls?.[0] ? (
                            <span
                              className="block truncate text-xs font-medium text-blue-600"
                              title={task.imageUrls[0]}
                            >
                              📷 {getDisplayValue(task.imageUrls[0])}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          {editingPrompt?.number === task.number ? (
                            <Textarea
                              value={editingPrompt.value}
                              onChange={(event) => handlePromptChange(event.target.value)}
                              onBlur={handlePromptBlur}
                              onKeyDown={handlePromptKeyDown}
                              rows={4}
                              autoFocus
                              className="text-xs"
                              disabled={updatePromptMutation.isPending}
                            />
                          ) : (
                            <button
                              type="button"
                              className="w-full text-left text-xs text-slate-600 whitespace-pre-wrap break-words"
                              title={task.prompt || '点击编辑提示词'}
                              onClick={() => startEditingPrompt(task)}
                            >
                              {task.prompt || '—'}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('font-medium text-xs', STATUS_COLOR[task.status] ?? 'bg-slate-100 text-slate-700')}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={task.status === '成功' ? 100 : task.progress ?? 0} className="h-1.5" />
                            <span className="text-xs text-muted-foreground">
                              {task.status === '成功' ? '100%' : `${task.progress ?? 0}%`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {task.localPath || task.remoteUrl ? (
                            <button
                              type="button"
                              className="block truncate text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
                              title="点击查看视频所在文件夹"
                              onClick={() => handleOpenOutputLocation(task)}
                            >
                              {getDisplayValue(task.localPath ?? task.remoteUrl)}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>新建图生视频任务</CardTitle>
                <CardDescription>
                  填写 Veo3 视频提示词与参考图，一个图片对应一个任务
                  {isSettingsLoading ? ' (正在读取默认设置...)' : ''}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActivePage('tasks')}>
                返回任务列表
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
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
    </div>
  );
}
