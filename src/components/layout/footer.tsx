'use client';

import { useI18n } from '@/lib/i18n';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="fixed bottom-0 left-[300px] right-0 border-t border-gray-200 bg-white/80 backdrop-blur-xl">
      <div className="flex items-center justify-center gap-6 px-6 py-3 text-xs text-gray-500">
        <span>{t('footer.rights')}</span>
        <a href="#" className="hover:text-gray-900 transition-colors">
          {t('footer.terms')}
        </a>
        <a href="#" className="hover:text-gray-900 transition-colors">
          {t('footer.privacy')}
        </a>
        <a href="#" className="hover:text-gray-900 transition-colors">
          {t('footer.about')}
        </a>
      </div>
    </footer>
  );
}
