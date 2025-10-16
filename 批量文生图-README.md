# 批量文生图系统架构文档

## 概述

批量文生图系统是一个基于AI的图像生成服务，支持多种AI平台、风格设置、图片引用和并发处理。系统采用模块化设计，支持灵活的配置和扩展。

## 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端界面      │    │   API路由层     │    │   业务逻辑层    │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │PromptManager│ │───▶│ │/api/generate│ │───▶│ │generateImages│ │
│ │             │ │    │ │/images      │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   数据存储层    │    │   AI服务层      │
                       │                 │    │                 │
                       │ ┌─────────────┐ │    │ ┌─────────────┐ │
                       │ │AppData      │ │    │ │多平台支持   │ │
                       │ │PromptEntry  │ │    │ │云雾/API易   │ │
                       │ │StyleEntry   │ │    │ │apicore/KIE  │ │
                       │ └─────────────┘ │    │ └─────────────┘ │
                       └─────────────────┘    └─────────────────┘
```

## 核心组件

### 1. API路由层 (`/api/generate/images`)

**文件位置**: `src/app/api/generate/images/route.ts`

**功能**: 接收前端请求，调用业务逻辑层

**接口定义**:
```typescript
POST /api/generate/images
Content-Type: application/json

{
  "mode": "new" | "selected" | "all",
  "numbers": string[] // 可选，当mode为selected时使用
}

// 响应
{
  "success": boolean,
  "message": string,
  "warnings": string[] // 可选
}
```

### 2. 业务逻辑层 (`generateImages`)

**文件位置**: `src/lib/image-generation.ts`

**核心函数**: `generateImages({ mode, numbers })`

**处理流程**:
1. 读取应用数据 (`readAppData()`)
2. 根据模式筛选目标提示词
3. 解析API配置 (`resolveApiConfig()`)
4. 应用风格设置和图片引用
5. 并发处理所有提示词
6. 更新状态和进度

### 3. 提示词处理 (`processPrompt`)

**核心逻辑**:
```typescript
async function processPrompt(options: {
  entry: PromptEntry;
  apiConfig: ApiConfig;
  retryCount: number;
  imageMap: Map<string, ImageReference>;
  styleContent?: string;
  saveDir: string;
})
```

**处理步骤**:
1. 应用风格到提示词
2. 提取图片引用
3. 构建多模态消息内容
4. 调用AI服务
5. 解析响应并保存图片
6. 更新状态

## 支持的AI平台

| 平台名称 | API端点 | 模型 | 说明 |
|---------|---------|------|------|
| 云雾 | `https://yunwu.ai/v1/chat/completions` | `gemini-2.5-flash-image-preview` | 支持多模态输入 |
| API易 | `https://vip.apiyi.com/v1/chat/completions` | `gemini-2.5-flash-image-preview` | 高可用性 |
| apicore | `https://api.apicore.ai/v1/chat/completions` | `gemini-2.5-flash-image` | 稳定可靠 |
| KIE.AI | `https://api.kie.ai/v1/chat/completions` | `gemini-2.5-flash-image-preview` | 专业服务 |

## 配置系统

### API配置
```typescript
interface ApiConfig {
  url: string;        // API端点
  model: string;      // 模型名称
  apiKey: string;     // API密钥
  platform: string;   // 平台名称
}
```

### 应用设置
```typescript
interface ApiSettings {
  retryCount: number;     // 重试次数
  threadCount: number;    // 并发线程数
  savePath: string;       // 保存路径
}
```

## 数据流图

```
用户操作
    │
    ▼
┌─────────────┐
│ 选择模式    │
│ (new/selected/all) │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 筛选提示词  │
└─────────────┘
    │
    ▼
┌─────────────┐
┌─────────────┐
│ 应用风格    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 提取图片引用│
└─────────────┘
    │
    ▼
┌─────────────┐
│ 构建消息    │
│ (文本+图片) │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 调用AI服务  │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 解析响应    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 保存图片    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 更新状态    │
└─────────────┘
```

## 状态管理

### 提示词状态
```typescript
type PromptStatus = '等待中' | '生成中' | '下载中' | '成功' | '失败';
```

### 状态流转
```
等待中 → 生成中 → 下载中 → 成功
  │         │         │
  └─────────┴─────────┴→ 失败
```

## 错误处理

### 重试机制
- 支持配置重试次数
- 指数退避算法
- 状态更新和进度跟踪

### 错误类型
1. **网络错误**: API调用失败
2. **解析错误**: 响应格式不正确
3. **保存错误**: 文件系统操作失败
4. **配置错误**: API密钥或配置无效

## 性能优化

### 并发控制
- 使用 `pLimit` 控制并发数
- 可配置线程数量
- 避免API限流

### 资源管理
- 图片压缩和优化
- 内存使用控制
- 文件系统监控

## 使用示例

### 前端调用
```typescript
// 生成所有新提示词
await api.startImageGeneration({ mode: 'new' });

// 生成选中的提示词
await api.startImageGeneration({ 
  mode: 'selected', 
  numbers: ['1', '2', '3'] 
});

// 重新生成所有提示词
await api.startImageGeneration({ mode: 'all' });
```

### 配置示例
```typescript
// 应用数据配置
const appData = {
  apiSettings: {
    retryCount: 3,
    threadCount: 2,
    savePath: 'public/generated_images'
  },
  currentStyle: 'realistic',
  customStyleContent: 'high quality, detailed'
};
```

## 扩展性

### 添加新平台
1. 在 `PLATFORM_CONFIGS` 中添加配置
2. 实现平台特定的处理逻辑
3. 更新错误处理机制

### 自定义风格
1. 在风格库中添加新风格
2. 实现风格应用逻辑
3. 支持动态风格切换

## 监控和日志

### 日志记录
- 操作日志: 记录每个步骤的执行情况
- 错误日志: 记录失败原因和重试信息
- 性能日志: 记录执行时间和资源使用

### 监控指标
- 成功率统计
- 平均处理时间
- 并发使用情况
- 错误率分析

## 安全考虑

### API密钥管理
- 密钥加密存储
- 访问权限控制
- 密钥轮换机制

### 数据安全
- 图片内容验证
- 文件路径安全检查
- 输入数据验证

## 故障排除

### 常见问题
1. **API调用失败**: 检查密钥和网络连接
2. **图片保存失败**: 检查文件权限和磁盘空间
3. **并发限制**: 调整线程数量设置
4. **内存不足**: 减少并发数或增加系统内存

### 调试工具
- 详细日志输出
- 状态跟踪
- 性能分析
- 错误报告

---

*本文档最后更新: 2024年1月*
