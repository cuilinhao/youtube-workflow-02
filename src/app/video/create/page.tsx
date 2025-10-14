'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TopNav } from '@/components/layout/top-nav';
import { LeftPanel, DashboardTab } from '@/components/layout/left-panel';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoTaskForm, VideoTaskFormSubmitPayload, createEmptyVideoTaskDraft } from '@/components/dashboard/video-task-form';
import { api } from '@/lib/api';

export default function CreateVideoTaskPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const initialValues = useMemo(
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

  const addTaskMutation = useMutation({
    mutationFn: async (payload: VideoTaskFormSubmitPayload) => {
      const results: Awaited<ReturnType<typeof api.addVideoTask>>[] = [];

      for (let index = 0; index < payload.rows.length; index += 1) {
        const row = payload.rows[index];
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
        results.push(result);
      }

      return results;
    },
    onSuccess: async (results) => {
      const count = results?.length ?? 0;
      toast.success(`已添加 ${count} 个视频任务`);
      await queryClient.invalidateQueries({ queryKey: ['video-tasks'] });
      router.push('/?tab=image-to-video');
    },
    onError: (error: Error) => toast.error(error.message || '添加视频任务失败'),
  });

  const handleFormSubmit = (payload: VideoTaskFormSubmitPayload) => {
    if (!payload.rows.length) {
      toast.warning('请至少添加一行任务');
      return;
    }
    addTaskMutation.mutate(payload);
  };

  const handleCancel = () => {
    router.push('/?tab=image-to-video');
  };

  const handleTabChange = (tab: DashboardTab) => {
    router.push(`/?tab=${tab}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <LeftPanel activeTab="image-to-video" onTabChange={handleTabChange} />

      <main className="ml-[300px] mt-14 min-h-[calc(100vh-3.5rem)] pb-16">
        <div className="h-full space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-gray-900">新建图生视频任务</h2>
              <p className="text-sm text-gray-600">
                填写 Veo3 视频提示词与参考图，创建新的批量生成任务。
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/?tab=image-to-video">返回任务列表</Link>
            </Button>
          </div>

          <Card className="shadow-sm border border-slate-200">
            <CardHeader>
              <CardTitle>任务配置</CardTitle>
              <CardDescription>
                默认参数来自设置中心，可在此页单次调整。
                {isSettingsLoading ? ' 正在读取默认设置...' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="min-h-[520px]">
                <VideoTaskForm
                  mode="create"
                  initialValues={initialValues}
                  onSubmit={handleFormSubmit}
                  onCancel={handleCancel}
                  isSubmitting={addTaskMutation.isPending}
                  submitLabel={addTaskMutation.isPending ? '提交中...' : '保存任务'}
                  cancelLabel="取消"
                  disableUpload={isSettingsLoading}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
