import type { AppProps } from 'next/app';

// 简单的 pages 入口，确保 pages 体系所需的上下文存在（仅用于 Next 内置错误页）。
export default function PagesApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
