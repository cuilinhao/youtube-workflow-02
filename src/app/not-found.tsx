'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-center px-6">
      <div className="space-y-4 max-w-xl">
        <div className="text-6xl">😕</div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('notFound.title')}</h1>
        <p className="text-slate-600">{t('notFound.description')}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
        >
          {t('notFound.back')}
        </Link>
      </div>
    </div>
  );
}
