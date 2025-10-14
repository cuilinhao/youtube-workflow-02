'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiSettings, VideoSettings } from '@/lib/api';

export function SettingsCenter() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const [apiSettings, setApiSettings] = useState<ApiSettings | null>(null);
  const [videoSettings, setVideoSettings] = useState<VideoSettings | null>(null);
  const [customStyle, setCustomStyle] = useState(data?.customStyleContent ?? '');

  useEffect(() => {
    if (data) {
      setApiSettings(data.apiSettings);
      setVideoSettings(data.videoSettings);
      setCustomStyle(data.customStyleContent ?? '');
    }
  }, [data]);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: {
      apiSettings?: Partial<ApiSettings>;
      videoSettings?: Partial<VideoSettings>;
      customStyleContent?: string;
    }) => api.updateSettings(payload),
    onSuccess: () => {
      toast.success('设置已保存');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message || '保存设置失败'),
  });

  if (isLoading || !apiSettings || !videoSettings) {
    return (
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <CardTitle>⚙️ 设置中心</CardTitle>
          <CardDescription>正在加载配置...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleSave = () => {
    updateSettingsMutation.mutate({
      apiSettings,
      videoSettings,
      customStyleContent: customStyle,
    });
  };

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader>
        <CardTitle>⚙️ 设置中心</CardTitle>
        <CardDescription>配置批量出图与图生视频的全局参数</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">图片生成参数</h3>
            <p className="text-sm text-muted-foreground">
              控制并发线程、失败重试次数以及本地保存目录。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="thread-count">并发线程数</Label>
              <Input
                id="thread-count"
                type="number"
                min={1}
                max={2000}
                value={apiSettings.threadCount}
                onChange={(event) =>
                  setApiSettings((prev) => prev && { ...prev, threadCount: Number(event.target.value) || 1 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry-count">失败重试次数</Label>
              <Input
                id="retry-count"
                type="number"
                min={0}
                max={5}
                value={apiSettings.retryCount}
                onChange={(event) =>
                  setApiSettings((prev) => prev && { ...prev, retryCount: Number(event.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="save-path">图片保存目录</Label>
              <Input
                id="save-path"
                value={apiSettings.savePath}
                onChange={(event) =>
                  setApiSettings((prev) => prev && { ...prev, savePath: event.target.value })
                }
                placeholder="例如：public/generated_images"
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">图生视频默认配置</h3>
            <p className="text-sm text-muted-foreground">设置 Veo3 接口相关参数，任务将默认继承这些设置。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="video-save-path">视频保存目录</Label>
              <Input
                id="video-save-path"
                value={videoSettings.savePath}
                onChange={(event) =>
                  setVideoSettings((prev) => prev && { ...prev, savePath: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-aspect">默认画幅比例</Label>
              <Input
                id="video-aspect"
                value={videoSettings.defaultAspectRatio}
                onChange={(event) =>
                  setVideoSettings((prev) => prev && { ...prev, defaultAspectRatio: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-watermark">默认水印</Label>
              <Input
                id="video-watermark"
                value={videoSettings.defaultWatermark}
                onChange={(event) =>
                  setVideoSettings((prev) => prev && { ...prev, defaultWatermark: event.target.value })
                }
                placeholder="可留空"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-callback">默认回调地址</Label>
              <Input
                id="video-callback"
                value={videoSettings.defaultCallback}
                onChange={(event) =>
                  setVideoSettings((prev) => prev && { ...prev, defaultCallback: event.target.value })
                }
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="video-fallback"
                checked={videoSettings.enableFallback}
                onCheckedChange={(checked) =>
                  setVideoSettings((prev) => prev && { ...prev, enableFallback: Boolean(checked) })
                }
              />
              <Label htmlFor="video-fallback" className="text-sm text-muted-foreground">
                启用备用模型 (enableFallback)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="video-translation"
                checked={videoSettings.enableTranslation}
                onCheckedChange={(checked) =>
                  setVideoSettings((prev) => prev && { ...prev, enableTranslation: Boolean(checked) })
                }
              />
              <Label htmlFor="video-translation" className="text-sm text-muted-foreground">
                启用提示词翻译 (enableTranslation)
              </Label>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">自定义风格提示语</h3>
            <p className="text-sm text-muted-foreground">
              在批量出图界面选择“自定义风格”时，会自动追加下方内容。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-style">自定义风格内容</Label>
            <Textarea
              id="custom-style"
              rows={6}
              value={customStyle}
              onChange={(event) => setCustomStyle(event.target.value)}
              placeholder="请输入补充的风格描述..."
            />
          </div>
        </section>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              data &&
              (setApiSettings(data.apiSettings),
              setVideoSettings(data.videoSettings),
              setCustomStyle(data.customStyleContent ?? ''))
            }
          >
            重置
          </Button>
          <Button onClick={handleSave}>保存设置</Button>
        </div>
      </CardContent>
    </Card>
  );
}
