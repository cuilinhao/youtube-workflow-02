'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export function LeftPanel({ activeTab, onTabChange }: LeftPanelProps) {
  const options = [
    {
      id: 'text-to-image' as const,
      title: '文生图',
      icon: '🖼',
      description: 'AI 图片生成',
    },
    {
      id: 'image-to-video' as const,
      title: '图生视频',
      icon: '📹',
      description: 'Veo3 转视频',
    },
    {
      id: 'video-workflow' as const,
      title: '视频工作流',
      icon: '🎬',
      description: '流程管理',
    },
    {
      id: 'settings' as const,
      title: '设置',
      icon: '⚙️',
      description: '全局参数',
    },
    {
      id: 'style-library' as const,
      title: '风格库',
      icon: '🎨',
      description: '风格模板',
    },
    {
      id: 'reference-library' as const,
      title: '参考图库',
      icon: '🖼️',
      description: '素材管理',
    },
    {
      id: 'key-manager' as const,
      title: '密钥库',
      icon: '🔑',
      description: 'API 密钥',
    },
  ];

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-[200px] border-r border-gray-200/80 bg-gradient-to-b from-slate-50 to-white">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          <div className="space-y-1 px-2">
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">AI CREATE</h2>
            <p className="text-[10px] text-slate-400">选择生成类型</p>
          </div>
          <div className="space-y-1.5">
            {options.map((option) => (
              <Card
                key={option.id}
                onClick={() => onTabChange(option.id)}
                className={cn(
                  'cursor-pointer border transition-all duration-200 hover:scale-[1.02]',
                  activeTab === option.id
                    ? 'border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                )}
              >
                <div className="p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'text-xl flex-shrink-0',
                      activeTab === option.id && 'transform scale-110'
                    )}>
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={cn(
                          'text-sm font-bold leading-tight',
                          activeTab === option.id ? 'text-blue-700' : 'text-slate-800'
                        )}
                      >
                        {option.title}
                      </h3>
                      <p className={cn(
                        'text-[10px] leading-tight mt-0.5 truncate',
                        activeTab === option.id ? 'text-blue-600' : 'text-slate-500'
                      )}>
                        {option.description}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
