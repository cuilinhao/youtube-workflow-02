'use client';

export default function YoutubeServerErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="space-y-3 text-center px-6">
        <div className="text-5xl">🚧</div>
        <h1 className="text-2xl font-semibold">服务器开小差了</h1>
        <p className="text-muted-foreground">请稍后再试，或返回首页重试。</p>
      </div>
    </div>
  );
}
