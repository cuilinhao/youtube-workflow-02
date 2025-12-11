'use client';

import { useEffect } from 'react';
import { I18nProvider, detectInitialLanguage, useI18n } from '@/lib/i18n';

type GlobalErrorProps = {
  error: Error;
  reset: () => void;
};

function GlobalErrorContent({ error, reset }: GlobalErrorProps) {
  // 在最顶层捕获未处理的异常，确保不会触发 Next 默认的 <Html> 警告
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);
  const { t } = useI18n();

  return (
    <body className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="space-y-4 text-center">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-2xl font-semibold">{t('globalError.title')}</h1>
        <p className="text-slate-600">{t('globalError.description')}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
        >
          {t('error.retry')}
        </button>
      </div>
    </body>
  );
}

export default function GlobalError(props: GlobalErrorProps) {
  const initialLanguage = detectInitialLanguage();

  return (
    <html lang={initialLanguage === 'zh' ? 'zh-CN' : 'en'}>
      <I18nProvider initialLanguage={initialLanguage}>
        <GlobalErrorContent {...props} />
      </I18nProvider>
    </html>
  );
}
