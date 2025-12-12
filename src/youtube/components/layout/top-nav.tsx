'use client';

import { Button } from '@/components/ui/button';
import { useI18n } from '@youtube/lib/i18n';
import { LanguageToggle } from './language-toggle';
import { ModeToggle } from './mode-toggle';

export function TopNav() {
  const { t } = useI18n();

  return (
    // 顶部导航固定在窗口顶部，滚动时始终可见
    <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold text-foreground">
              Nano Banana
            </div>
            <div className="text-xs text-muted-foreground">
              {t('nav.tagline')}
            </div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a
              href="#"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('nav.explore')}
            </a>
            <a
              href="#"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('nav.assets')}
            </a>
            <a
              href="#"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('nav.gallery')}
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle />
          <LanguageToggle className="text-muted-foreground hover:text-foreground hover:bg-accent" />
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
          >
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
