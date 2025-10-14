'use client';

import { Button } from '@/components/ui/button';

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="container flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold text-gray-900">Nano Banana</div>
            <div className="text-xs text-gray-500">AI 批量生成</div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Explore
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Assets
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Gallery
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
            登录
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            订阅
          </Button>
        </div>
      </div>
    </header>
  );
}
