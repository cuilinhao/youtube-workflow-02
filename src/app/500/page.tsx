'use client';

// 自定义 500 页面，避免使用 Next 默认的 pages 体系 500 页，从而绕过 <Html> 报错。
export default function GlobalServerError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="space-y-3 text-center px-6">
        <div className="text-5xl">🚧</div>
        <h1 className="text-2xl font-semibold">服务器开小差了</h1>
        <p className="text-slate-600">请稍后再试，或返回首页重试。</p>
      </div>
    </div>
  );
}
