# Cloudflare R2 接入说明

本项目新增了 Cloudflare R2 存储接入，可通过预签名 URL 在前端完成直传、私有读取、列举与删除示例。此文档介绍环境变量配置、CORS 策略以及常见使用注意事项。

## 环境变量
在项目根目录的 `.env.local` 中新增以下变量（使用你的实际值替换占位符）：

```
R2_BUCKET_NAME=your-bucket
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://images.example.com
# 可选：若使用临时凭证，可设置下方变量（STS 会返回 Session Token）
# R2_SESSION_TOKEN=your-session-token
# 注意：旧版 `R2_TOKEN` 不等同于 Session Token，本项目不会读取。
```

- `R2_ENDPOINT` 指向 Cloudflare R2 的 S3 兼容 API 端点。
- `R2_PUBLIC_BASE_URL` 可填入自定义域或 `https://<account-id>.r2.dev`，用于快速拼接公开访问链接；留空时将通过 GET 预签名获取临时链接。
- 所有密钥仅应保存在服务端环境变量中，切勿暴露到前端或提交到版本库。若密钥泄露请立即在 Cloudflare 控制台中吊销并重置。

## CORS 配置
为了允许浏览器直传，请在 Cloudflare R2 控制台为目标存储桶设置 CORS 规则，例如：

- **Allowed Origins**：`https://your-domain.com`、`http://localhost:3000`
- **Allowed Methods**：`PUT`, `GET`, `HEAD`
- **Allowed Headers**：`Content-Type`, `x-amz-content-sha256`, `x-amz-date`, `authorization`
- **Max Age**：600 (可按需调整)

如果使用自定义域，请确保该域名同样允许跨域访问或通过 Cloudflare Access/WAF 做相关控制。

## 功能概览
- `POST /api/r2/presign`：生成 PUT 预签名 URL，限制对象 key 以 `uploads/` 前缀开头。
- `GET /api/r2/presign-get`：生成 GET 预签名 URL，适用于私有对象临时访问。
- `GET /api/r2/list`：列举指定前缀的对象，返回 key、大小与更新时间。
- `POST /api/r2/delete`：删除对象。**注意：示例未接入鉴权，生产环境必须加入身份验证和权限校验。**
- `components/R2Uploader.tsx`：前端演示组件，展示文件选择、上传进度条、上传完成提示、列表与删除操作。

## 公共读与私有读
- 若存储桶开启公共访问，可直接使用 `R2_PUBLIC_BASE_URL + '/' + key` 访问对象（推荐为生产配置自定义域并设置缓存策略）。
- 若存储桶保持私有，可通过 `/api/r2/presign-get` 获取短期有效的读取链接。页面内“获取临时链接”按键即演示此流程。

请勿尝试使用 `https://<account>.r2.cloudflarestorage.com/<key>` 直接访问对象，该域仅用于 S3 API 交互。

## 大文件与扩展实现
- 对于体积较大的文件，建议升级为 Multipart Upload：`CreateMultipartUpload → UploadPart → CompleteMultipartUpload`，或使用 `@aws-sdk/lib-storage` 的高阶封装。
- 可在服务端/Worker 中协调分片状态，以支持断点续传、秒传等高级功能。

## Cloudflare Workers 方案（可选）
若后续迁移到 Cloudflare Workers，可通过 R2 Binding 在 Worker 内直接生成预签名 URL 或代理上传流程，前端只需与 Worker 通信即可。此模式有助于隐藏原始 API 端点并配合 Cloudflare Access 进行统一鉴权。

## 安全建议
- 限制可写入的 key 前缀，并在后端再次校验。
- 删除操作必须结合业务身份验证，只允许用户操作自己的对象。
- 避免在日志中输出完整的预签名 URL 或密钥信息，必要时做脱敏处理。
- 定期轮换 Access Key，并监控 R2 存储访问日志。
