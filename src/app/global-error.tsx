'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error;
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  // 在最顶层捕获未处理的异常，确保不会触发 Next 默认的 <Html> 警告
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-semibold">页面出错了</h1>
          <p className="text-slate-600">请刷新页面或点击下方按钮重试。</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
