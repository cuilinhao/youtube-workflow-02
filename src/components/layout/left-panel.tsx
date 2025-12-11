'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageIcon, VideoIcon, ClapperboardIcon, SettingsIcon, PaletteIcon, FolderIcon, KeyIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type DashboardTab =
  | 'text-to-image'
  | 'image-to-video'
  | 'video-workflow'
  | 'settings'
  | 'style-library'
  | 'reference-library'
  | 'key-manager';

interface LeftPanelProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

type NavOption = {
  id: DashboardTab;
  title: string;
  icon: LucideIcon;
  badge?: string;
};

export function LeftPanel({ activeTab, onTabChange }: LeftPanelProps) {
  const { t } = useI18n();

  const createOptions: NavOption[] = [
    { id: 'text-to-image', title: t('sidebar.tab.textToImage'), icon: ImageIcon },
    { id: 'image-to-video', title: t('sidebar.tab.imageToVideo'), icon: VideoIcon, badge: t('sidebar.badge.new') },
  ];

  const workflowOptions: NavOption[] = [
    { id: 'video-workflow', title: t('sidebar.tab.videoWorkflow'), icon: ClapperboardIcon },
  ];

  const libraryOptions: NavOption[] = [
    { id: 'style-library', title: t('sidebar.tab.styleLibrary'), icon: PaletteIcon },
    { id: 'reference-library', title: t('sidebar.tab.referenceLibrary'), icon: FolderIcon },
    { id: 'key-manager', title: t('sidebar.tab.keyManager'), icon: KeyIcon },
  ];

  const settingsOptions: NavOption[] = [{ id: 'settings', title: t('sidebar.tab.settings'), icon: SettingsIcon }];

  const NavItem = ({ option }: { option: NavOption }) => {
    const Icon = option.icon;
    const isActive = activeTab === option.id;

    return (
      <button
        onClick={() => onTabChange(option.id)}
        className={cn(
          // Default to浅色风格，dark:为暗色模式下的对照样式
          'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
          isActive
            ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5'
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="text-[15px] font-medium">{option.title}</span>
        {option.badge && (
          <span className="ml-auto text-[10px] px-2 py-0.5 bg-pink-500 text-white rounded-full font-semibold">
            {option.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-[240px] bg-white border-r border-gray-200 dark:bg-[#1a1a1a] dark:border-white/10">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-6">
          {/* AI Create Section */}
          <div className="space-y-2">
            <h2 className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
              {t('sidebar.section.create')}
            </h2>
            <div className="space-y-1">
              {createOptions.map((option) => (
                <NavItem key={option.id} option={option} />
              ))}
            </div>
          </div>

          {/* Workflow Section */}
          <div className="space-y-2">
            <div className="space-y-1">
              {workflowOptions.map((option) => (
                <NavItem key={option.id} option={option} />
              ))}
            </div>
          </div>

          {/* Library Section */}
          <div className="space-y-2">
            <div className="space-y-1">
              {libraryOptions.map((option) => (
                <NavItem key={option.id} option={option} />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 dark:bg-white/10" />

          {/* Settings Section */}
          <div className="space-y-1">
            {settingsOptions.map((option) => (
              <NavItem key={option.id} option={option} />
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
