'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@/components/layout/top-nav';
import { LeftPanel, DashboardTab } from '@/components/layout/left-panel';
import { Footer } from '@/components/layout/footer';
import { PromptManager } from './prompt-manager';
import { VideoTaskBoard } from './video-task-board';
import { SettingsCenter } from './settings-center';
import { StyleLibrary } from './style-library';
import { ReferenceLibrary } from './reference-library';
import { KeyManager } from './key-manager';

function isDashboardTab(value: string): value is DashboardTab {
  return (
    value === 'text-to-image' ||
    value === 'image-to-video' ||
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

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && isDashboardTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    const current = searchParams.get('tab');
    if (current === tab) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', tab);
    router.replace(`?${nextParams.toString()}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <LeftPanel activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="ml-[300px] mt-14 min-h-[calc(100vh-3.5rem)] pb-16">
        <div className="h-full space-y-6 p-6">
          {activeTab === 'text-to-image' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">批量文生图</h2>
                <p className="text-sm text-gray-600">管理提示词，批量生成 AI 图片</p>
              </div>
              <PromptManager />
            </div>
          )}

          {activeTab === 'image-to-video' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">批量图生视频</h2>
                <p className="text-sm text-gray-600">使用 Veo3 将图片转换为视频</p>
              </div>
              <VideoTaskBoard />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">设置中心</h2>
                <p className="text-sm text-gray-600">配置批量出图与图生视频的全局参数</p>
              </div>
              <SettingsCenter />
            </div>
          )}

          {activeTab === 'style-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">风格库</h2>
                <p className="text-sm text-gray-600">维护常用风格模板，便于批量应用</p>
              </div>
              <StyleLibrary />
            </div>
          )}

          {activeTab === 'reference-library' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">参考图库</h2>
                <p className="text-sm text-gray-600">集中管理出图所需的参考素材</p>
              </div>
              <ReferenceLibrary />
            </div>
          )}

          {activeTab === 'key-manager' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">密钥库</h2>
                <p className="text-sm text-gray-600">统一维护各平台 API Key 与默认密钥</p>
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
