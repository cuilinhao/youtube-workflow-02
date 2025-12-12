# Youtube 工作流嵌入式迁移方案（主工程保留）

## 已确认需求
1. URL `/` 展示 Youtube 工作流首页；模板的 `/pricing`、`/blog`、`/terms`、`/login` 等仍正常可访问。  
2. Youtube 工作流公开可用；登录后可按需增强能力（后续接入主工程会话）。  
3. Youtube API 全部加前缀，避免与主工程 API 冲突（`/api/youtube/*`）。  
4. 版本以主工程为主，但升级到稳定的 Next 15.6.x + React 19.1。  

## 迁移执行步骤
1. **恢复主工程作为基线**  
   - 以 `/_backup_before_youtube` 为源恢复模板目录结构、页面、登录/支付/博客/协议等功能。  
   - 保留现有 `.env.local`（含 R2/AI 凭证），其余生成物清理重装。  

2. **引入 Youtube 代码为独立模块**  
   - 新建 `src/youtube/` 作为模块根：复制 Youtube 的 `components/`、`constants/`、`data/`、`lib/`、`providers/`、`server-init.ts`。  
   - `tsconfig.json` 增加 `@youtube/* -> src/youtube/*` 别名。  
   - Youtube 内部非 UI 的 `@/components/*`、`@/lib/*`、`@/constants/*`、`@/providers/*` 等改为 `@youtube/*`；UI 组件继续复用主工程 `@/components/ui/*`。  

3. **挂载 Youtube 页面到 App Router**  
   - 在 `src/app/[locale]/(youtube)/` 下建立 Youtube 路由组：  
     - `page.tsx` 作为 Youtube 首页，对应 URL `/`（默认 locale）。  
     - 迁入 `/video/create` 等 Youtube 页面到同组保持原 URL。  
     - 组内 `layout.tsx` 仅做 Providers/样式包装（无 html/body）。  
   - 将模板原营销首页移动到 `/home`（或等价路径）避免根路由冲突。  

4. **迁入并命名空间化 Youtube API**  
   - 将 Youtube 的 `src/app/api/*` 迁到主工程 `src/app/api/youtube/*` 下，路径保持一致。  
   - 更新 Youtube 客户端请求（`src/youtube/lib/api.ts` 等）统一加前缀 `/api/youtube`。  

5. **依赖与配置对齐**  
   - 主工程 `package.json`：升级 `next`、`react`、`react-dom` 至稳定 15.6.x/19.1。  
   - 补齐 Youtube 所需但主工程缺失的依赖（AWS SDK、axios、p-limit、papaparse、undici、sharp 等）。  
   - `next.config.ts`、middleware、i18n、mdx、支付/登录配置保持主工程逻辑不变。  

6. **本地验证**  
   - 编写 `scripts/smoke-dev.mjs`：启动 dev，校验 `/`（Youtube）与 `/pricing`、`/blog` 等模板路由均可渲染。  
   - 运行一次 Youtube R2 上传脚本与（可选）生成 API 脚本验证新前缀可用。  

## 风险点
- Next 15.6 升级可能引起 mdx/intl/biome 或某些依赖的 peer 变动，需要按报错小幅调整。  
- 路由冲突：若模板存在与 Youtube 同名路由（如 `/video`），需改为路由组内优先或调整模板路径。  
- 若支付 Provider 在启动期强依赖环境变量，缺失 Stripe/Creem Key 可能影响相关页面，但不应阻塞 Youtube 首页渲染。  

