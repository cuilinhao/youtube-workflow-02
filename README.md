# Youtube 工作流（嵌入 MkSaaS 模板）

一个基于 Next.js 15 / React 19 的 Youtube 视频生成与管理工作流。项目在 MkSaaS 主模板之上集成了 `youtube-workflow` 模块，根路由 `/` 直接展示工作流界面，同时保留模板的登录/支付/博客等能力。

## 功能概览

- 工作流首页与仪表盘（`/`）
- 视频任务创建与批量生成（`/video/create`）
- 参考图/素材库与本地状态存储（`data/app-data.json`）
- R2/S3 兼容对象存储上传与管理（`/api/youtube/r2/*`）
- 通过 AI/第三方服务生成图片/视频（`/api/youtube/generate-*` 等）

## 目录结构

- `src/youtube/`：Youtube 工作流独立模块（components/lib/providers 等）
- `src/app/[locale]/(youtube)/`：工作流页面挂载与路由组
- `src/app/api/youtube/`：工作流 API 命名空间
- 其它目录保持 MkSaaS 模板结构

## 本地运行

1. 安装依赖  
   `pnpm install`
2. 配置环境变量  
   复制 `env.example` 为 `.env.local`，按需填写 R2/AI/数据库等 key
3. 启动开发  
   `pnpm dev`

访问：

- `http://localhost:3000/` → Youtube 工作流
- `http://localhost:3000/home` → 模板营销首页
- 其它模板路由：`/pricing`、`/blog`、`/terms`、`/auth/login` 等

Smoke 测试：`pnpm run smoke:dev`

## 部署（可选）

使用 OpenNext for Cloudflare：

- 预览：`pnpm preview`
- 部署：`pnpm deploy`
- 上传静态产物：`pnpm upload`

## 迁移说明

详细迁移记录见 `迁移.md`、`EMBED_YOUTUBE_MIGRATION.md`、`YOUTUBE_MIGRATION.md`。

## License

MIT，见 `LICENSE`。
