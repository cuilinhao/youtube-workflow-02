import type { ReactNode } from 'react';
import { YoutubeProviders } from '@youtube/app-providers';

// Youtube 工作流依赖运行时写入本地 JSON，并避免静态预渲染问题
export const dynamic = 'force-dynamic';

interface YoutubeLayoutProps {
  children: ReactNode;
}

export default function YoutubeLayout({ children }: YoutubeLayoutProps) {
  return <YoutubeProviders>{children}</YoutubeProviders>;
}

