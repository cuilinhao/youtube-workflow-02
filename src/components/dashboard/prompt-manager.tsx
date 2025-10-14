'use client';

import { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { api, PromptEntry, PromptStatus } from '@/lib/api';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { DownloadIcon, Layers2Icon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';

interface PromptWithIndex extends PromptEntry {
  index: number;
}

const STATUS_COLOR: Record<PromptStatus, string> = {
  等待中: 'bg-slate-100 text-slate-700 border border-slate-200',
  生成中: 'bg-blue-100 text-blue-700 border border-blue-200',
  下载中: 'bg-amber-100 text-amber-700 border border-amber-200',
  成功: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  失败: 'bg-rose-100 text-rose-700 border border-rose-200',
};

function groupByStatus(prompts: PromptEntry[]) {
  return prompts.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { 等待中: 0, 生成中: 0, 下载中: 0, 成功: 0, 失败: 0 } as Record<PromptStatus, number>,
  );
}

export function PromptManager() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPrompt, setEditingPrompt] = useState<PromptEntry | null>(null);
  const [editingText, setEditingText] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newNumber, setNewNumber] = useState('');

  const { data: promptData, isLoading: promptsLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: api.getPrompts,
    refetchInterval: (query) => {
      const promptsList = query.state.data?.prompts as PromptEntry[] | undefined;
      const hasRunning = promptsList?.some((item) => ['生成中', '下载中'].includes(item.status));
      return hasRunning ? 4000 : false;
    },
  });

  const { data: stylesData } = useQuery({
    queryKey: ['styles'],
    queryFn: api.getStyles,
  });

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const prompts: PromptEntry[] = useMemo(() => promptData?.prompts ?? [], [promptData]);
  const statusStats = useMemo(() => groupByStatus(prompts), [prompts]);
  const styles = stylesData?.styles ?? [];
  const currentStyle = settings?.currentStyle ?? '';
  const currentStyleContent = settings?.customStyleContent ?? '';

  const addPromptsMutation = useMutation({
    mutationFn: api.addPrompts,
    onSuccess: () => {
      toast.success('提示词已添加');
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (error: Error) => toast.error(error.message || '添加提示词失败'),
  });

  const deletePromptMutation = useMutation({
    mutationFn: (number: string) => api.removePrompt(number),
    onSuccess: () => {
      toast.success('已删除提示词');
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setSelected(new Set());
    },
    onError: (error: Error) => toast.error(error.message || '删除提示词失败'),
  });

  const clearPromptsMutation = useMutation({
    mutationFn: api.clearPrompts,
    onSuccess: () => {
      toast.success('已清空提示词');
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setSelected(new Set());
    },
    onError: (error: Error) => toast.error(error.message || '清空提示词失败'),
  });

  const generateMutation = useMutation({
    mutationFn: (payload: { mode: 'new' | 'selected' | 'all'; numbers?: string[] }) =>
      api.startImageGeneration(payload),
    onSuccess: (response) => {
      if (response.success) {
        toast.success('已提交图片生成任务');
        queryClient.invalidateQueries({ queryKey: ['prompts'] });
      } else {
        toast.info(response.message ?? '没有需要生成的提示词');
      }
    },
    onError: (error: Error) => toast.error(error.message || '启动批量出图失败'),
  });

  const updatePromptMutation = useMutation({
    mutationFn: ({ number, payload }: { number: string; payload: Partial<PromptEntry> }) =>
      api.updatePrompt(number, payload),
    onSuccess: () => {
      toast.success('提示词已更新');
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setEditingPrompt(null);
    },
    onError: (error: Error) => toast.error(error.message || '更新提示词失败'),
  });

  const updateStyleSelection = useMutation({
    mutationFn: (value: { currentStyle?: string; customStyleContent?: string }) =>
      api.updateSettings(value),
    onSuccess: () => {
      toast.success('风格已更新');
      refetchSettings();
    },
    onError: (error: Error) => toast.error(error.message || '更新风格失败'),
  });

  const handleRowSelect = (number: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  const handleOpenEdit = (entry: PromptEntry) => {
    setEditingPrompt(entry);
    setEditingText(entry.prompt);
  };

  const handleEditSave = () => {
    if (!editingPrompt) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      toast.error('提示词不能为空');
      return;
    }
    updatePromptMutation.mutate({
      number: editingPrompt.number,
      payload: { prompt: trimmed },
    });
  };

  const handleDeleteSelected = () => {
    if (!selected.size) {
      toast.warning('请先选择要删除的提示词');
      return;
    }
    selected.forEach((number) => deletePromptMutation.mutate(number));
  };

  const handleStartGeneration = (mode: 'new' | 'selected' | 'all') => {
    if (mode === 'selected' && !selected.size) {
      toast.warning('请先选择需要重新生成的提示词');
      return;
    }
    generateMutation.mutate({ mode, numbers: mode === 'selected' ? Array.from(selected) : undefined });
  };

  const handleAddPrompt = () => {
    if (!newPrompt.trim()) {
      toast.error('请输入提示词内容');
      return;
    }
    addPromptsMutation.mutate([{ prompt: newPrompt.trim(), number: newNumber.trim() || undefined }]);
    setAddDialogOpen(false);
    setNewPrompt('');
    setNewNumber('');
  };

  const handleImportCsv = (file: File) => {
    Papa.parse<{ 分镜提示词?: string; 分镜编号?: string }>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length) {
          toast.error(`解析 CSV 失败: ${result.errors[0].message}`);
          return;
        }
        const rows = result.data
          .map((row) => ({
            prompt: row['分镜提示词']?.toString().trim() ?? '',
            number: row['分镜编号']?.toString().trim() ?? undefined,
          }))
          .filter((row) => row.prompt);
        if (!rows.length) {
          toast.warning('CSV 中未找到有效提示词');
          return;
        }
        addPromptsMutation.mutate(rows);
      },
      error: (error) => toast.error(`解析 CSV 失败: ${error.message}`),
    });
  };

  const handleExportCsv = () => {
    if (!prompts.length) {
      toast.warning('没有可导出的提示词');
      return;
    }
    const csv = Papa.unparse(
      prompts.map((item) => ({
        分镜编号: item.number,
        分镜提示词: item.prompt,
        状态: item.status,
        图片路径: item.localPath ?? item.imageUrl ?? '',
        错误信息: item.errorMsg ?? '',
      })),
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nanobana_prompts_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('提示词已导出');
  };

  const handleStyleChange = (value: string) => {
    if (value === '__none__') {
      updateStyleSelection.mutate({ currentStyle: '', customStyleContent: '' });
      return;
    }
    if (value === 'custom') {
      updateStyleSelection.mutate({ currentStyle: '', customStyleContent: currentStyleContent });
      return;
    }
    updateStyleSelection.mutate({
      currentStyle: value,
      customStyleContent: styles.find((style) => style.name === value)?.content ?? '',
    });
  };

  const sortedPrompts: PromptWithIndex[] = useMemo(
    () =>
      prompts
        .map((item, index) => ({ ...item, index }))
        .sort((a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10)),
    [prompts],
  );

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold">📝 提示词管理与批量出图</CardTitle>
            <CardDescription>导入提示词、配置风格后即可批量调用 Nano banana 图像接口</CardDescription>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>总计: {prompts.length}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-emerald-600">成功: {statusStats.成功}</span>
            <span className="text-rose-600">失败: {statusStats.失败}</span>
            <span className="text-blue-600">生成中: {statusStats.生成中}</span>
            <span className="text-slate-600">等待中: {statusStats.等待中}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Layers2Icon className="mr-2 h-4 w-4" /> 导入 CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleImportCsv(file);
                event.target.value = '';
              }
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => setAddDialogOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" /> 添加提示词
          </Button>
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
            onClick={() => clearPromptsMutation.mutate()}
            disabled={!prompts.length}
          >
            <Trash2Icon className="mr-2 h-4 w-4" /> 清空全部
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!prompts.length}>
            <DownloadIcon className="mr-2 h-4 w-4" /> 导出 CSV
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">🎨 风格:</Label>
            <Select
              value={currentStyle || (currentStyleContent ? 'custom' : '__none__')}
              onValueChange={handleStyleChange}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="选择风格" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">无风格叠加</SelectItem>
                {styles.map((style) => (
                  <SelectItem key={style.name} value={style.name}>
                    {style.name}
                  </SelectItem>
                ))}
                <SelectItem value="custom">自定义风格</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStyleContent && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            <div className="mb-2 font-medium text-slate-900">当前风格提示语将自动附加：</div>
            <p className="whitespace-pre-wrap">{currentStyleContent}</p>
          </div>
        )}

        <ScrollArea className="h-[420px] rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100">
                <TableHead className="w-20">编号</TableHead>
                <TableHead>提示词</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead className="w-56">生成图片</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promptsLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    正在加载提示词...
                  </TableCell>
                </TableRow>
              ) : !sortedPrompts.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    暂无提示词，请先导入或添加。
                  </TableCell>
                </TableRow>
              ) : (
                sortedPrompts.map((prompt) => (
                  <TableRow
                    key={prompt.number}
                    onClick={() => handleRowSelect(prompt.number)}
                    onDoubleClick={() => handleOpenEdit(prompt)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      selected.has(prompt.number) && 'bg-sky-50',
                    )}
                  >
                    <TableCell className="font-semibold text-slate-700">{prompt.number}</TableCell>
                    <TableCell>
                      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                        {prompt.prompt}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('font-medium', STATUS_COLOR[prompt.status])}>{prompt.status}</Badge>
                      {prompt.status === '失败' && prompt.errorMsg && (
                        <p className="mt-2 text-xs text-rose-600">{prompt.errorMsg}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {prompt.status === '成功' && (prompt.localPath || prompt.imageUrl) ? (
                        <div className="flex flex-col gap-2">
                          <div className="relative h-32 w-full overflow-hidden rounded-md border">
                            <Image
                              src={prompt.localPath ? `/${prompt.localPath}` : prompt.imageUrl ?? ''}
                              alt={`生成图片 ${prompt.number}`}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, 220px"
                            />
                          </div>
                          <a
                            href={prompt.localPath ? `/${prompt.localPath}` : prompt.imageUrl}
                            target="_blank"
                            className="text-xs text-blue-600 underline hover:text-blue-700"
                            rel="noreferrer"
                          >
                            点击预览原图
                          </a>
                        </div>
                      ) : prompt.status === '下载中' ? (
                        <span className="text-sm text-blue-600">📥 正在下载...</span>
                      ) : prompt.status === '失败' ? (
                        <span className="text-sm text-rose-600">❌ 生成失败</span>
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={generateMutation.isPending}
              onClick={() => handleStartGeneration('new')}
            >
              <RefreshCwIcon className="mr-2 h-4 w-4" /> 智能生成（仅新增）
            </Button>
            <Button
              size="sm"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!selected.size || generateMutation.isPending}
              onClick={() => handleStartGeneration('selected')}
            >
              <RefreshCwIcon className="mr-2 h-4 w-4" /> 重新生成选中
            </Button>
            <Button
              size="sm"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!prompts.length || generateMutation.isPending}
              onClick={() => handleStartGeneration('all')}
            >
              <RefreshCwIcon className="mr-2 h-4 w-4" /> 重新生成全部
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 小提示：单击选中行，双击可编辑提示词内容；生成时会自动附加当前选择的风格提示语。
          </p>
        </div>
      </CardContent>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加提示词</DialogTitle>
            <DialogDescription>输入提示词内容，可选填编号。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-text">提示词</Label>
              <Textarea
                id="prompt-text"
                rows={6}
                value={newPrompt}
                onChange={(event) => setNewPrompt(event.target.value)}
                placeholder="请输入提示词内容..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-number">提示词编号（可选）</Label>
              <Input
                id="prompt-number"
                value={newNumber}
                onChange={(event) => setNewNumber(event.target.value)}
                placeholder="若留空系统将自动分配"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddPrompt} disabled={!newPrompt.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑提示词 - 编号 {editingPrompt?.number}</DialogTitle>
            <DialogDescription>更新后会立即保存并刷新提示词列表。</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            value={editingText}
            onChange={(event) => setEditingText(event.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrompt(null)}>
              取消
            </Button>
            <Button onClick={handleEditSave} disabled={!editingText.trim()}>
              保存更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
