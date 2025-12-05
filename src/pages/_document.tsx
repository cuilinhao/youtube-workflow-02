import Document, { Html, Head, Main, NextScript } from 'next/document';

// 标准 pages 路由 Document（仅用于内置错误页生成）
export default class AppDocument extends Document {
  render() {
    return (
      <Html lang="zh-CN">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
