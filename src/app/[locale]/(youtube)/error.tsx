'use client';

import { useEffect } from 'react';
import { useI18n } from '@youtube/lib/i18n';

type AppErrorProps = {
  error: Error;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error('[YoutubeError]', error);
  }, [error]);

  const { t } = useI18n();

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="space-y-3 text-center max-w-md px-4">
        <div className="text-4xl">😵</div>
        <h2 className="text-xl font-semibold">{t('error.title')}</h2>
        <p className="text-slate-600">{t('error.description')}</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
        >
          {t('error.retry')}
        </button>
      </div>
    </div>
  );
}

