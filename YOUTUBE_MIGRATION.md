# Youtube 工作流迁移说明

## 目标
- 将当前项目替换为 `/Users/linhao/Desktop/youtube-工作流/youtube-workflow-02` 的代码，使首页 `/` 直接展示 youtube 工作流界面。
- 以 youtube 工程的依赖和配置为基线，其他模板需求为其让步。

## 方案
- 基线：采用 youtube 工程的 Next 15.6-canary + React 19.1 版本及其配置（eslint、tailwind、脚本），淘汰现有模板特有的 mdx/intl/biome 体系。
- 复制方式：清理/备份现有代码后，整体同步 youtube 工程文件到当前仓库，排除 `node_modules`、`.next`、测试报告等生成物，并忽略源项目的 `.env.local`（包含敏感凭证），改用占位的示例环境文件。
- 配置合并：以 youtube 的 `next.config.ts`、`tsconfig.json`、`package.json` 为主，必要时仅合并图片白名单等小改动。
- 数据与运行：保留 `data/app-data.json` 等本地存储路径；脚本继续使用端口 3000，并保留 `NODE_OPTIONS=--dns-result-order=ipv4first`。
- 自测：编写一个本地 smoke 脚本启动 dev 服务并请求 `/`，用于迁移后快速验证页面可起。

## 执行步骤（计划）
1) 备份当前仓库主要文件，删除旧的 `node_modules` 等生成物。  
2) 从源项目 rsync 代码到当前目录，排除敏感文件和构建产物。  
3) 生成占位 `.env.example`，安装依赖，校验构建脚本。  
4) 编写并运行 smoke 测试脚本，确认 `http://localhost:3000/` 返回预期首页。  
5) 收尾：清理不再使用的模板文件/脚本，更新文档说明。
