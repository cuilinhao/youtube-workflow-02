'use client';

import Link from 'next/link';
import { useI18n } from '@youtube/lib/i18n';

export default function YoutubeNotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-muted/40 via-background to-muted/40 text-center px-6 text-foreground">
      <div className="space-y-4 max-w-xl">
        <div className="text-6xl">😕</div>
        <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
        <p className="text-muted-foreground">{t('notFound.description')}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
        >
          {t('notFound.back')}
        </Link>
      </div>
    </div>
  );
}
