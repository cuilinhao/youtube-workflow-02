# Nano Banana 批量出图 · Web 版

基于 **Next.js App Router + Tailwind CSS + shadcn/ui** 改写原「Nano banana 批量出图 V4.0」桌面端，提供一站式的提示词管理、批量出图、Veo3 图生视频、风格库、参考图库、密钥库与设置中心等功能。项目内置前后端任务调度、数据持久化与 Cloudflare R2 直传能力，面向团队协作和自动化批量生产场景。

## 核心亮点
- **提示词中心**：CSV 导入导出、批量粘贴、状态追踪、实时缩略图、单条/批量重试与全量再生成。
- **图生视频任务面板**：集中管理 Veo3 任务，支持画幅、水印、回调、随机种子、备用模型与自动翻译，并实时轮询生成状态、自动下载 MP4。
- **Cloudflare R2 集成**：
  - 页面底部提供 R2 测试上传卡片，用于验证凭证与 CORS 设置；
  - 图生视频弹窗新增「上传参考图文件夹」按钮，可一次性导入文件夹里所有图片，自动上传到 R2 并填充 `imageUrls` 供 Veo3 使用（带进度条与结果提示）。
- **风格库 + 参考图库**：可创建/重命名/删除风格、统计字符、导入导出；图库支持分类、去重上传、网络链接引用，提示词中引用图片名将自动附图。
- **密钥库与设置中心**：集中维护多平台 API Key、批量出图并发/重试次数、默认保存目录与 Veo3 默认参数；设置更新会同步至任务调度。
- **任务调度与数据落地**：Node.js 服务端重现桌面端的异步逻辑，支持并发队列、失败重试、生成文件落地、本地 JSON 数据库持久化。

## 技术栈
- **前端**：Next.js 15、React 19、Tailwind CSS、shadcn/ui、@tanstack/react-query、lucide-react、sonner
- **后端**：Next.js App Router API Route、Node.js、Axios、p-limit
- **工具与库**：TypeScript、ESLint、PostCSS、新增 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`（用于 R2）

## 目录结构
```
.
├── data/app-data.json          # 所有配置、提示词、图库、密钥、任务的持久化存储
├── public/                     # 静态资源与生成的图片/视频落地目录
├── src/
│   ├── app/                    # App Router 页面与 API Routes（含生成任务、R2 接口等）
│   ├── components/             # 仪表盘组件、R2Uploader、自定义 UI 包装
│   └── lib/                    # 数据存储、调度逻辑、常量与工具函数
├── README-R2.md                # R2 集成的详细说明（CORS、公共/私有读、扩展建议）
├── scripts/                    # 本地测试脚本（如 `test-r2-upload.js`）
├── package.json
└── ...
```

## 环境变量
在项目根目录创建 `.env.local`，常用配置如下：

```ini
# Veo3 / Gemini 等 KIE.AI 接口
KIE_API_KEY=your-kie-api-key

# Cloudflare R2 直传
R2_BUCKET_NAME=ai-image-video
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxxx
R2_SECRET_ACCESS_KEY=xxxx
R2_PUBLIC_BASE_URL=https://your-public-domain.com     # 可选：若桶开启公有读
# R2_SESSION_TOKEN=                                  # 可选：使用 STS 临时凭证时填写
```

更多 R2 细节（CORS 规则、公共 URL、私有读取与安全建议）见 [`README-R2.md`](README-R2.md)。

## 快速开始
1. **安装依赖**
   ```bash
   npm install
   ```
2. **启动开发环境**（默认 `http://localhost:3000`）：
   ```bash
   npm run dev
   ```
3. **构建生产版本**：
   ```bash
   npm run build
   npm run start
   ```
4. **代码质量**：
   ```bash
   npm run lint
   ```

## 使用说明
### 图生视频流程
1. 在图生视频面板点击「添加任务」。
2. 填写提示词等参数，如需参考图：
   - 可以直接粘贴外部 URL；
   - 或点击「上传参考图文件夹」，选择本地包含图片的目录，系统会逐图上传到 R2，并在上传完成后自动填入 URL。
3. 保存任务后，可多选任务点击「开始生成视频」，后台会并发调用 Veo3 API，完成后自动下载并记录本地/远程链接。

### R2 功能验证
- 首页底部提供 `Cloudflare R2 测试上传` 卡片：选择任意图片验证上传进度、上传结果、列举与删除接口是否正常。
- 若浏览器报 CORS 错误，请根据终端/浏览器日志对照 `README-R2.md` 调整桶的 CORS 规则。

## 常见问题
- **Veo3 上传失败**：检查 R2 CORS 是否允许 `http://localhost:3000` 的 `PUT/GET/HEAD/OPTIONS`，以及是否提供了正确的 `Content-Type` 与 `x-amz-*` 头。
- **任务无响应**：确认 `.env.local` 或设置中心已配置 KIE.AI API Key，且密钥未过期。
- **本地 JSON 冲突**：`data/app-data.json` 会在运行时频繁写入，请勿手动编辑或提交冲突版本。

## 下一步规划
- 支持 Cloudflare R2 Multipart Upload / 断点续传
- 将上传功能嵌入参考图库模块，形成共享素材中心
- 拓展更多第三方出图供应商与视频模型

---
如需部署或二次开发，请确认具有相关第三方 API 的使用权限，并妥善保护所有密钥。EOF
