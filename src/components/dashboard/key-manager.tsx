'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Badge } from '@/components/ui/badge';
import { api, KeyEntry } from '@/lib/api';
import { EyeIcon, EyeOffIcon, KeyIcon, PencilIcon, PlusIcon } from 'lucide-react';

const platforms = ['云雾', 'API易', 'apicore', 'KIE.AI'];

interface KeyModalState {
  mode: 'create' | 'edit';
  open: boolean;
  key?: KeyEntry | null;
}

export function KeyManager() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['keys'],
    queryFn: api.getKeys,
  });

  const keys = data?.keys ?? [];
  const current = data?.current ?? '';
  const [showSecrets, setShowSecrets] = useState(false);
  const [modalState, setModalState] = useState<KeyModalState>({ open: false, mode: 'create' });
  const [form, setForm] = useState({ name: '', apiKey: '', platform: '云雾' });

  const addKeyMutation = useMutation({
    mutationFn: (payload: { name: string; apiKey: string; platform: string }) => api.addKey(payload),
    onSuccess: () => {
      toast.success('密钥已保存');
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setModalState({ open: false, mode: 'create' });
      setForm({ name: '', apiKey: '', platform: '云雾' });
    },
    onError: (error: Error) => toast.error(error.message || '保存密钥失败'),
  });

  const updateKeyMutation = useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Partial<KeyEntry> }) => api.updateKey(name, payload),
    onSuccess: () => {
      toast.success('密钥已更新');
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setModalState({ open: false, mode: 'edit' });
    },
    onError: (error: Error) => toast.error(error.message || '更新密钥失败'),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (name: string) => api.removeKey(name),
    onSuccess: () => {
      toast.success('密钥已删除');
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message || '删除密钥失败'),
  });

  const handleOpenCreate = () => {
    setModalState({ open: true, mode: 'create' });
    setForm({ name: '', apiKey: '', platform: '云雾' });
  };

  const handleOpenEdit = (entry: KeyEntry) => {
    setModalState({ open: true, mode: 'edit', key: entry });
    setForm({ name: entry.name, apiKey: entry.apiKey, platform: entry.platform });
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.apiKey.trim()) {
      toast.error('请填写密钥名称和 API Key');
      return;
    }

    if (modalState.mode === 'create') {
      addKeyMutation.mutate({ name: form.name.trim(), apiKey: form.apiKey.trim(), platform: form.platform });
    } else if (modalState.key) {
      updateKeyMutation.mutate({
        name: modalState.key.name,
        payload: { name: form.name.trim(), apiKey: form.apiKey.trim(), platform: form.platform },
      });
    }
  };

  const setActiveMutation = useMutation({
    mutationFn: (entry: KeyEntry) =>
      api.updateSettings({
        apiSettings: { currentKeyName: entry.name, apiPlatform: entry.platform },
      }),
    onSuccess: (_, entry) => {
      toast.success(`已切换到密钥：${entry.name}`);
      queryClient.invalidateQueries({ queryKey: ['keys'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message || '切换密钥失败'),
  });

  const sortedKeys = [...keys].sort((a, b) => a.createdTime.localeCompare(b.createdTime));

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold">🔑 密钥库</CardTitle>
            <CardDescription>集中管理云雾/API易/apicore/KIE.AI 等平台密钥</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">当前使用: {current || '未选择'}</Badge>
            <Button variant="ghost" size="icon" onClick={() => setShowSecrets((prev) => !prev)}>
              {showSecrets ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleOpenCreate}>
            <PlusIcon className="mr-2 h-4 w-4" /> 新建密钥
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!sortedKeys.length) {
                toast.warning('暂无密钥可测试');
                return;
              }
              const first = sortedKeys[0];
              handleOpenEdit(first);
            }}
            disabled={!sortedKeys.length}
          >
            <PencilIcon className="mr-2 h-4 w-4" /> 编辑首个
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100">
                <TableHead className="w-14">状态</TableHead>
                <TableHead className="w-48">名称</TableHead>
                <TableHead className="w-32">平台</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead className="w-44">时间信息</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    正在加载密钥...
                  </TableCell>
                </TableRow>
              ) : !sortedKeys.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    暂无密钥，请先添加。
                  </TableCell>
                </TableRow>
              ) : (
                sortedKeys.map((entry) => (
                  <TableRow key={entry.name}>
                    <TableCell>
                      {current === entry.name ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                          使用中
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-600">
                          备用
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">{entry.name}</TableCell>
                    <TableCell>{entry.platform}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KeyIcon className="h-4 w-4 text-slate-400" />
                        <span className="font-mono text-xs">
                          {showSecrets ? entry.apiKey : entry.apiKey.replace(/.(?=.{4})/g, '•')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>创建: {entry.createdTime}</div>
                      <div>最近: {entry.lastUsed}</div>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleOpenEdit(entry)}>
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteKeyMutation.mutate(entry.name)}>
                        删除
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={current === entry.name}
                        onClick={() => setActiveMutation.mutate(entry)}
                      >
                        启用
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={modalState.open} onOpenChange={(open) => setModalState((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalState.mode === 'create' ? '新建 API 密钥' : `编辑密钥 · ${modalState.key?.name}`}</DialogTitle>
            <DialogDescription>密钥信息将保存在服务器本地配置文件中，请妥善保密。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">密钥名称</Label>
              <Input
                id="key-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：我的云雾密钥"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-platform">API 平台</Label>
              <select
                id="key-platform"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.platform}
                onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
              >
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-secret">API Key</Label>
              <Input
                id="key-secret"
                value={form.apiKey}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder="请输入完整密钥"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalState((prev) => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={!form.name.trim() || !form.apiKey.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
