'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api, ImageReference } from '@/lib/api';
import { FolderPlusIcon, PencilIcon, TrashIcon, UploadIcon, ImageIcon } from 'lucide-react';
import Image from 'next/image';

interface CategoryModalState {
  mode: 'create' | 'rename';
  open: boolean;
}

export function ReferenceLibrary() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['app-data'],
    queryFn: api.getAppData,
  });

  const [activeCategory, setActiveCategory] = useState('');
  const [modalState, setModalState] = useState<CategoryModalState>({ open: false, mode: 'create' });
  const [categoryName, setCategoryName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  const categories = useMemo(() => data?.categoryLinks ?? {}, [data]);
  const categoryEntries = useMemo(() => Object.entries(categories), [categories]);
  const images: ImageReference[] = activeCategory ? categories[activeCategory] ?? [] : [];

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: () => {
      toast.success('分类已创建');
      queryClient.invalidateQueries({ queryKey: ['app-data'] });
      setModalState({ open: false, mode: 'create' });
      setCategoryName('');
    },
    onError: (error: Error) => toast.error(error.message || '创建分类失败'),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ oldName, name }: { oldName: string; name: string }) => api.renameCategory(oldName, name),
    onSuccess: (response) => {
      toast.success('分类已重命名');
      queryClient.invalidateQueries({ queryKey: ['app-data'] });
      setActiveCategory(response.category);
      setModalState({ open: false, mode: 'rename' });
      setCategoryName('');
    },
    onError: (error: Error) => toast.error(error.message || '重命名分类失败'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (name: string) => api.deleteCategory(name),
    onSuccess: () => {
      toast.success('分类已删除');
      queryClient.invalidateQueries({ queryKey: ['app-data'] });
      setActiveCategory('');
    },
    onError: (error: Error) => toast.error(error.message || '删除分类失败'),
  });

  const uploadImageMutation = useMutation({
    mutationFn: (payload: { file: File; category: string; name: string }) => api.uploadReferenceImage(payload),
    onSuccess: () => {
      toast.success('图片已上传');
      queryClient.invalidateQueries({ queryKey: ['app-data'] });
    },
    onError: (error: Error) => toast.error(error.message || '上传图片失败'),
  });

  const deleteImageMutation = useMutation({
    mutationFn: ({ category, name }: { category: string; name: string }) => api.deleteReferenceImage(category, name),
    onSuccess: () => {
      toast.success('图片已删除');
      queryClient.invalidateQueries({ queryKey: ['app-data'] });
      setSelectedImages(new Set());
    },
    onError: (error: Error) => toast.error(error.message || '删除图片失败'),
  });

  const handleSubmitCategory = () => {
    if (!categoryName.trim()) {
      toast.error('分类名称不能为空');
      return;
    }
    if (modalState.mode === 'create') {
      createCategoryMutation.mutate(categoryName.trim());
    } else if (activeCategory) {
      renameCategoryMutation.mutate({ oldName: activeCategory, name: categoryName.trim() });
    }
  };

  const handleUpload = (file: File) => {
    if (!activeCategory) {
      toast.warning('请先选择分类，再上传图片');
      return;
    }
    const sanitizedName = file.name.replace(/\.[^.]+$/, '');
    uploadImageMutation.mutate({ file, category: activeCategory, name: sanitizedName });
  };

  const handleDeleteImages = () => {
    if (!activeCategory || !selectedImages.size) {
      toast.warning('请选择要删除的图片');
      return;
    }
    selectedImages.forEach((name) => deleteImageMutation.mutate({ category: activeCategory, name }));
  };

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold">🖼️ 参考图库</CardTitle>
            <CardDescription>维护批量出图所需的参考图片，可在提示词中引用其名称</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>分类: {categoryEntries.length}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>总图片: {categoryEntries.reduce((acc, [, imgs]) => acc + imgs.length, 0)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setModalState({ open: true, mode: 'create' });
              setCategoryName('');
            }}
          >
            <FolderPlusIcon className="mr-2 h-4 w-4" /> 新建分类
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!activeCategory) {
                toast.warning('请先选择要重命名的分类');
                return;
              }
              setModalState({ open: true, mode: 'rename' });
              setCategoryName(activeCategory);
            }}
            disabled={!activeCategory}
          >
            <PencilIcon className="mr-2 h-4 w-4" /> 重命名
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => activeCategory && deleteCategoryMutation.mutate(activeCategory)}
            disabled={!activeCategory}
          >
            <TrashIcon className="mr-2 h-4 w-4" /> 删除分类
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!activeCategory) {
                toast.warning('请先选择分类');
                return;
              }
              fileInputRef.current?.click();
            }}
            disabled={!activeCategory}
          >
            <UploadIcon className="mr-2 h-4 w-4" /> 添加图片
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleUpload(file);
                event.target.value = '';
              }
            }}
          />
          <Button variant="secondary" size="sm" onClick={handleDeleteImages} disabled={!selectedImages.size}>
            <TrashIcon className="mr-2 h-4 w-4" /> 删除图片
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="rounded-md border border-slate-200 bg-slate-50">
          <ScrollArea className="h-[440px]">
            <ul className="divide-y divide-slate-200 text-sm">
              {isLoading ? (
                <li className="px-4 py-3 text-muted-foreground">正在加载分类...</li>
              ) : !categoryEntries.length ? (
                <li className="px-4 py-3 text-muted-foreground">暂无分类，请先新建。</li>
              ) : (
                categoryEntries.map(([name, items]) => (
                  <li
                    key={name}
                    className={cn(
                      'cursor-pointer px-4 py-3 hover:bg-slate-100',
                      activeCategory === name && 'bg-slate-200 hover:bg-slate-200',
                    )}
                    onClick={() => {
                      setActiveCategory(name);
                      setSelectedImages(new Set());
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{name}</span>
                      <Badge variant="outline">{items.length}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{items.length ? items[0].name : '暂无图片'}</div>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="w-12">选择</TableHead>
                  <TableHead className="w-48">图片名称</TableHead>
                  <TableHead>路径 / 链接</TableHead>
                  <TableHead className="w-40">预览</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!activeCategory ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      请先选择分类
                    </TableCell>
                  </TableRow>
                ) : !images.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      该分类下暂无图片，可点击“添加图片”上传。
                    </TableCell>
                  </TableRow>
                ) : (
                  images.map((image) => (
                    <TableRow key={image.name} className="text-sm">
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedImages.has(image.name)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedImages((prev) => {
                              const next = new Set(prev);
                              if (checked) {
                                next.add(image.name);
                              } else {
                                next.delete(image.name);
                              }
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">{image.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {image.path ? (
                            <a
                              href={`/${image.path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 underline hover:text-blue-700"
                            >
                              {image.path}
                            </a>
                          ) : image.url ? (
                            <a
                              href={image.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 underline hover:text-blue-700"
                            >
                              {image.url}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {image.path ? (
                          <div className="relative h-16 w-24 overflow-hidden rounded-md border">
                            <Image
                              src={`/${image.path}`}
                              alt={image.name}
                              fill
                              className="object-cover"
                              sizes="96px"
                            />
                          </div>
                        ) : image.url ? (
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 underline hover:text-blue-700"
                          >
                            <ImageIcon className="h-4 w-4" /> 查看
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">无</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <Dialog open={modalState.open} onOpenChange={(open) => setModalState((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalState.mode === 'create' ? '新建分类' : '重命名分类'}</DialogTitle>
            <DialogDescription>
              {modalState.mode === 'create'
                ? '请输入新的分类名称，将在 /public/images 下创建对应目录。'
                : '请输入新的分类名称，相关图片路径会自动更新。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="category-name">分类名称</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="例如：角色特写"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalState((prev) => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button onClick={handleSubmitCategory} disabled={!categoryName.trim()}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
