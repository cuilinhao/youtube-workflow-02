'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export type DashboardTab =
  | 'text-to-image'
  | 'image-to-video'
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
      title: '批量文生图',
      icon: '🖼',
      description: '批量生成 AI 图片',
    },
    {
      id: 'image-to-video' as const,
      title: '批量图生视频',
      icon: '📹',
      description: 'Veo3 图片转视频',
    },
    {
      id: 'settings' as const,
      title: '设置中心',
      icon: '⚙️',
      description: '配置全局生成参数',
    },
    {
      id: 'style-library' as const,
      title: '风格库',
      icon: '🎨',
      description: '维护常用风格提示语',
    },
    {
      id: 'reference-library' as const,
      title: '参考图库',
      icon: '🖼️',
      description: '管理批量出图素材',
    },
    {
      id: 'key-manager' as const,
      title: '密钥库',
      icon: '🔑',
      description: '统一维护 API Key',
    },
  ];

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-[300px] border-r border-gray-200 bg-white p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">AI Create</h2>
          <p className="text-xs text-gray-400">选择生成类型</p>
        </div>
        <div className="space-y-3">
          {options.map((option) => (
            <Card
              key={option.id}
              onClick={() => onTabChange(option.id)}
              className={cn(
                'cursor-pointer border-2 transition-all duration-200',
                'hover:border-blue-400 hover:shadow-md',
                activeTab === option.id
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white'
              )}
            >
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{option.icon}</div>
                  <div className="flex-1">
                    <h3
                      className={cn(
                        'text-base font-semibold',
                        activeTab === option.id ? 'text-blue-700' : 'text-gray-900'
                      )}
                    >
                      {option.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </aside>
  );
}
