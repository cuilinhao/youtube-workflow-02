'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api, StyleEntry } from '@/lib/api';
import { DEFAULT_STYLE_LIBRARY } from '@/lib/constants';
import { DownloadIcon, FilePlus2Icon, PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react';

const defaultStylesArray = Object.values(DEFAULT_STYLE_LIBRARY);

export function StyleLibrary() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['styles'],
    queryFn: api.getStyles,
  });

  const styles = useMemo(() => data?.styles ?? [], [data]);
  const [activeName, setActiveName] = useState<string>('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (styles.length && !activeName) {
      setActiveName(styles[0].name);
    }
  }, [styles, activeName]);

  useEffect(() => {
    const target = styles.find((style) => style.name === activeName);
    if (target) {
      setName(target.name);
      setCategory(target.category ?? '');
      setContent(target.content ?? '');
      setCharCount(target.content?.length ?? 0);
    }
  }, [activeName, styles]);

  const upsertMutation = useMutation({
    mutationFn: (style: Partial<StyleEntry> & { name: string }) => api.upsertStyle(style),
    onSuccess: () => {
      toast.success('风格已保存');
      queryClient.invalidateQueries({ queryKey: ['styles'] });
    },
    onError: (error: Error) => toast.error(error.message || '保存风格失败'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ originalName, payload }: { originalName: string; payload: Partial<StyleEntry> & { name?: string } }) =>
      api.updateStyle(originalName, payload),
    onSuccess: () => {
      toast.success('风格已更新');
      queryClient.invalidateQueries({ queryKey: ['styles'] });
    },
    onError: (error: Error) => toast.error(error.message || '更新风格失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (styleName: string) => api.deleteStyle(styleName),
    onSuccess: () => {
      toast.success('风格已删除');
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setActiveName('');
    },
    onError: (error: Error) => toast.error(error.message || '删除风格失败'),
  });

  const handleSave = () => {
    if (!name.trim() || !content.trim()) {
      toast.error('风格名称与内容不能为空');
      return;
    }
    const payload = {
      name: name.trim(),
      content: content.trim(),
      category: category.trim() || '自定义',
    };
    if (activeName && activeName === name) {
      upsertMutation.mutate(payload);
    } else if (activeName && activeName !== name) {
      updateMutation.mutate({ originalName: activeName, payload });
      setActiveName(payload.name);
    } else {
      upsertMutation.mutate(payload);
      setActiveName(payload.name);
    }
  };

  const handleCreate = () => {
    setActiveName('');
    setName('新建风格');
    setCategory('自定义');
    setContent('');
    setCharCount(0);
  };

  const handleCopy = () => {
    if (!activeName) {
      toast.warning('请先选择要复制的风格');
      return;
    }
    const original = styles.find((style) => style.name === activeName);
    if (!original) return;
    const copyName = `${original.name}-副本`;
    setActiveName('');
    setName(copyName);
    setCategory(original.category);
    setContent(original.content);
    setCharCount(original.content.length);
  };

  const handleDelete = () => {
    if (!activeName) {
      toast.warning('请先选择要删除的风格');
      return;
    }
    deleteMutation.mutate(activeName);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result?.toString() ?? '';
        const json = JSON.parse(text);
        const entries: StyleEntry[] = Array.isArray(json)
          ? json
          : Object.values(json ?? {});
        if (!entries.length) {
          toast.warning('导入文件中没有检测到风格数据');
          return;
        }
        entries.forEach((style) => {
          upsertMutation.mutate({
            name: style.name,
            content: style.content,
            category: style.category,
          });
        });
        toast.success(`成功导入 ${entries.length} 个风格`);
      } catch (error) {
        toast.error(`导入失败: ${(error as Error).message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleExport = () => {
    if (!styles.length) {
      toast.warning('暂无风格可导出');
      return;
    }
    const payload = JSON.stringify(styles, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nanobana_styles_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('已导出风格库');
  };

  const handleReset = () => {
    defaultStylesArray.forEach((style) => {
      upsertMutation.mutate({
        name: style.name,
        content: style.content,
        category: style.category,
      });
    });
    toast.success('已恢复默认风格库');
  };

  const filteredStyles = useMemo(
    () => [...styles].sort((a, b) => a.name.localeCompare(b.name, 'zh-cn')),
    [styles],
  );

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold">🎨 风格库管理</CardTitle>
            <CardDescription>维护常用风格提示语，可快速在出图时选用</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>总数: {styles.length}</span>
            {activeName ? <Badge variant="secondary">当前: {activeName}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleCreate}>
            <PlusIcon className="mr-2 h-4 w-4" /> 新建
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopy} disabled={!activeName}>
            <FilePlus2Icon className="mr-2 h-4 w-4" /> 复制
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDelete} disabled={!activeName}>
            <Trash2Icon className="mr-2 h-4 w-4" /> 删除
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={!styles.length}>
            <DownloadIcon className="mr-2 h-4 w-4" /> 导出
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="mr-2 h-4 w-4" /> 导入
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleImport(file);
                event.target.value = '';
              }
            }}
          />
          <Button variant="secondary" size="sm" onClick={handleReset}>
            恢复默认库
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-md border border-slate-200 bg-slate-50">
          <ScrollArea className="h-[460px]">
            <ul className="divide-y divide-slate-200 text-sm">
              {isLoading ? (
                <li className="px-4 py-3 text-muted-foreground">正在加载风格...</li>
              ) : !filteredStyles.length ? (
                <li className="px-4 py-3 text-muted-foreground">暂无风格，请新建。</li>
              ) : (
                filteredStyles.map((style) => (
                  <li
                    key={style.name}
                    className={cn(
                      'cursor-pointer px-4 py-3 hover:bg-slate-100',
                      activeName === style.name && 'bg-slate-200 hover:bg-slate-200',
                    )}
                    onClick={() => setActiveName(style.name)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{style.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {style.category ?? '未分类'}
                      </Badge>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{style.content}</div>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="style-name">风格名称</Label>
              <Input
                id="style-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入风格名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style-category">分类标签</Label>
              <Input
                id="style-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="例如：摄影风格/插画风格"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label htmlFor="style-content">风格内容</Label>
              <span className="text-xs text-muted-foreground">字符数：{charCount}</span>
            </div>
            <Textarea
              id="style-content"
              rows={12}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setCharCount(event.target.value.length);
              }}
              placeholder="请输入风格描述内容...\n例如：\n极致的超写实主义照片风格，画面呈现出..."
            />
          </div>
          <Separator />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setActiveName('')}>
              清空编辑
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || !content.trim()}>
              保存风格
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
