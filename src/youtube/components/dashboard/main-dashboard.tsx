'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@youtube/components/layout/top-nav';
import { LeftPanel, DashboardTab } from '@youtube/components/layout/left-panel';
import { Footer } from '@youtube/components/layout/footer';
import { PromptManager } from './prompt-manager';
import { VideoTaskBoard } from './video-task-board';
import { VideoWorkflow } from './video-workflow';
import { SettingsCenter } from './settings-center';
import { StyleLibrary } from './style-library';
import { ReferenceLibrary } from './reference-library';
import { KeyManager } from './key-manager';
import { useI18n } from '@youtube/lib/i18n';

function isDashboardTab(value: string): value is DashboardTab {
  return (
    value === 'text-to-image' ||
    value === 'image-to-video' ||
    value === 'text-to-video' ||
    value === 'video-workflow' ||
    value === 'settings' ||
    value === 'style-library' ||
    value === 'reference-library' ||
    value === 'key-manager'
  );
}

export function MainDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>('text-to-image');
  const { t } = useI18n();

  useEffect(() => {
    if (!searchParams) return;
    const tabParam = searchParams.get('tab');
    if (tabParam && isDashboardTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tab: DashboardTab) => {
    if (!searchParams) return;
    setActiveTab(tab);
    const current = searchParams.get('tab');
    if (current === tab) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', tab);
    router.replace(`?${nextParams.toString()}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <LeftPanel activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="ml-[240px] mt-14 min-h-[calc(100vh-3.5rem)] pb-16 bg-gradient-to-br from-muted/40 via-background to-muted/40">
        <div className="h-full space-y-6 p-6">
          {activeTab === 'text-to-image' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.textToImage.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.textToImage.subtitle')}
                </p>
              </div>
              <PromptManager />
            </div>
          )}

          {activeTab === 'image-to-video' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.imageToVideo.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.imageToVideo.subtitle')}
                </p>
              </div>
              <VideoTaskBoard />
            </div>
          )}

          {activeTab === 'text-to-video' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.textToVideo.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.textToVideo.subtitle')}
                </p>
              </div>
              {/* 复用图生视频的看板与表单逻辑，仅更换文案 */}
              <VideoTaskBoard
                headerTitle="🎬 文生视频任务"
                headerDescription="批量生成 Veo3 文生视频任务列表"
                promptOnly
              />
            </div>
          )}

          {activeTab === 'video-workflow' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.videoWorkflow.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.videoWorkflow.subtitle')}
                </p>
              </div>
              <VideoWorkflow />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.settings.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.settings.subtitle')}
                </p>
              </div>
              <SettingsCenter />
            </div>
          )}

          {activeTab === 'style-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.styleLibrary.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.styleLibrary.subtitle')}
                </p>
              </div>
              <StyleLibrary />
            </div>
          )}

          {activeTab === 'reference-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.referenceLibrary.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.referenceLibrary.subtitle')}
                </p>
              </div>
              <ReferenceLibrary />
            </div>
          )}

          {activeTab === 'key-manager' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">
                  {t('main.keyManager.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t('main.keyManager.subtitle')}
                </p>
              </div>
              <KeyManager />
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
