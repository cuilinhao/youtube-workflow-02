'use client';

import { useEffect } from 'react';

type AppErrorProps = {
  error: Error;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  // 捕获当前路由下的异常并打印日志，便于排查
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="space-y-3 text-center max-w-md px-4">
        <div className="text-4xl">😵</div>
        <h2 className="text-xl font-semibold">发生错误</h2>
        <p className="text-slate-600">请稍后重试，或刷新页面恢复。</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}
