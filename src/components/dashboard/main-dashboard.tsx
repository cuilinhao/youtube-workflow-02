'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@/components/layout/top-nav';
import { LeftPanel, DashboardTab } from '@/components/layout/left-panel';
import { Footer } from '@/components/layout/footer';
import { PromptManager } from './prompt-manager';
import { VideoTaskBoard } from './video-task-board';
import { VideoWorkflow } from './video-workflow';
import { SettingsCenter } from './settings-center';
import { StyleLibrary } from './style-library';
import { ReferenceLibrary } from './reference-library';
import { KeyManager } from './key-manager';
import { useI18n } from '@/lib/i18n';

function isDashboardTab(value: string): value is DashboardTab {
  return (
    value === 'text-to-image' ||
    value === 'image-to-video' ||
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
    <div className="min-h-screen bg-[#0f0f0f]">
      <TopNav />
      <LeftPanel activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="ml-[240px] mt-14 min-h-[calc(100vh-3.5rem)] pb-16 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="h-full space-y-6 p-6">
          {activeTab === 'text-to-image' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.textToImage.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.textToImage.subtitle')}</p>
              </div>
              <PromptManager />
            </div>
          )}

          {activeTab === 'image-to-video' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.imageToVideo.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.imageToVideo.subtitle')}</p>
              </div>
              <VideoTaskBoard />
            </div>
          )}

          {activeTab === 'video-workflow' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.videoWorkflow.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.videoWorkflow.subtitle')}</p>
              </div>
              <VideoWorkflow />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.settings.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.settings.subtitle')}</p>
              </div>
              <SettingsCenter />
            </div>
          )}

          {activeTab === 'style-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.styleLibrary.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.styleLibrary.subtitle')}</p>
              </div>
              <StyleLibrary />
            </div>
          )}

          {activeTab === 'reference-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.referenceLibrary.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.referenceLibrary.subtitle')}</p>
              </div>
              <ReferenceLibrary />
            </div>
          )}

          {activeTab === 'key-manager' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{t('main.keyManager.title')}</h2>
                <p className="text-sm text-gray-600">{t('main.keyManager.subtitle')}</p>
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
