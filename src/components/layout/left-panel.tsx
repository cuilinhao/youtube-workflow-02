'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageIcon, VideoIcon, ClapperboardIcon, SettingsIcon, PaletteIcon, FolderIcon, KeyIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  const createOptions: NavOption[] = [
    { id: 'text-to-image', title: 'Image', icon: ImageIcon },
    { id: 'image-to-video', title: 'Video', icon: VideoIcon, badge: 'New' },
  ];

  const workflowOptions: NavOption[] = [{ id: 'video-workflow', title: 'Workflow', icon: ClapperboardIcon }];

  const libraryOptions: NavOption[] = [
    { id: 'style-library', title: 'Styles', icon: PaletteIcon },
    { id: 'reference-library', title: 'Assets', icon: FolderIcon },
    { id: 'key-manager', title: 'Keys', icon: KeyIcon },
  ];

  const settingsOptions: NavOption[] = [{ id: 'settings', title: 'Settings', icon: SettingsIcon }];

  const NavItem = ({ option }: { option: NavOption }) => {
    const Icon = option.icon;
    const isActive = activeTab === option.id;

    return (
      <button
        onClick={() => onTabChange(option.id)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
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
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-[240px] bg-[#1a1a1a] border-r border-white/10">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-6">
          {/* AI Create Section */}
          <div className="space-y-2">
            <h2 className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              AI Create
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
          <div className="h-px bg-white/10" />

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
