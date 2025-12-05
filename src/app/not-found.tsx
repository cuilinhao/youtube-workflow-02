'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-center px-6">
      <div className="space-y-4 max-w-xl">
        <div className="text-6xl">😕</div>
        <h1 className="text-2xl font-semibold text-slate-900">页面走丢了</h1>
        <p className="text-slate-600">
          未找到对应的页面，可能链接已失效或内容被移除。请返回主页或检查链接是否正确。
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors"
        >
          返回主页
        </Link>
      </div>
    </div>
  );
}
