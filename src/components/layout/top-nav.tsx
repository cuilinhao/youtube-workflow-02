'use client';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { LanguageToggle } from './language-toggle';

export function TopNav() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="container flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold text-gray-900">Nano Banana</div>
            <div className="text-xs text-gray-500">{t('nav.tagline')}</div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t('nav.explore')}
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t('nav.assets')}
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t('nav.gallery')}
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle className="text-gray-700 hover:text-gray-900" />
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
            {t('nav.login')}
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            {t('nav.subscribe')}
          </Button>
        </div>
      </div>
    </header>
  );
}
