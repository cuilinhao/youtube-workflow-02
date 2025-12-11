import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

// 全局强制动态渲染，跳过静态预渲染阶段，避免构建期的 HtmlContext 报错
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nano Banana 批量出图 Web",
  description: "Nano banana 批量出图 V4.0 的 Web 版：批量出图、图生视频、风格库、参考图库与密钥管理一站整合",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Google Analytics 全站统计 */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-870BNT6QG8" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-870BNT6QG8');
          `}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
