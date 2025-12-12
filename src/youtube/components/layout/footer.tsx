'use client';

import { useI18n } from '@youtube/lib/i18n';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="fixed bottom-0 left-[300px] right-0 border-t border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center justify-center gap-6 px-6 py-3 text-xs text-muted-foreground">
        <span>{t('footer.rights')}</span>
        <a href="#" className="hover:text-foreground transition-colors">
          {t('footer.terms')}
        </a>
        <a href="#" className="hover:text-foreground transition-colors">
          {t('footer.privacy')}
        </a>
        <a href="#" className="hover:text-foreground transition-colors">
          {t('footer.about')}
        </a>
      </div>
    </footer>
  );
}
