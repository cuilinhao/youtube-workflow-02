### VEO3 接入与调用说明

#### 总览
- 客户端发起生成：`useVideoGeneration` → `generateVideoClient` 向 VEO3 发起生成
- 轮询状态：`pollVideoGeneration` 周期性调用 `record-info`，成功后返回视频 URL
- 自动下载与落盘：成功后调用本地接口 `POST /api/video-tasks/download` 将视频保存到 `public/generated_videos`
- 批量生成（服务端）：`POST /api/generate/videos` 调用 `generateVideos`，内部串联相同的生成与轮询流程，并完成下载与数据更新

#### API Base
- **生成接口**: `https://api.kie.ai/api/v1/veo/generate`
- **记录/状态查询**: `https://api.kie.ai/api/v1/veo/record-info`
- **鉴权**: Header `Authorization: Bearer <API_KEY>`

### 客户端调用

- 生成请求与任务创建（`src/lib/video-generation-client.ts`）

```ts
export async function generateVideoClient(
  apiKey: string,
  payload: VideoGenerationPayload,
): Promise<{ taskId: string }> {
  const response = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'veo3_fast',
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`生成视频失败 (${response.status}): ${text}`);
  }

  const data: VideoGenerationResponse = await response.json();

  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`API 返回错误: ${data.msg || '未知错误'}`);
  }

  return { taskId: data.data.taskId };
}
```

- 请求体参数（`VideoGenerationPayload`）

```ts
export interface VideoGenerationPayload {
  prompt: string;
  imageUrls?: string[];
  model?: string;
  aspectRatio?: string;
  watermark?: string;
  callBackUrl?: string;
  seeds?: number;
  enableFallback?: boolean;
  enableTranslation?: boolean;
}
```

- 轮询查询状态（`src/lib/video-generation-client.ts`）

```ts
export async function queryVideoStatus(
  apiKey: string,
  taskId: string,
): Promise<VideoRecordResponse['data']> {
  const url = `${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`查询失败 (${response.status})`);
  }

  const data: VideoRecordResponse = await response.json();

  if (data.code !== 200) {
    throw new Error(`API 返回错误: ${data.msg || '未知错误'}`);
  }

  return data.data;
}
```

- 轮询控制（成功判定与进度回调）

```ts
export async function pollVideoGeneration(
  apiKey: string,
  taskId: string,
  callbacks: ProgressCallback = {},
  maxPollTimes = 120,
  pollInterval = 5000,
): Promise<string> {
  let pollCount = 0;

  while (pollCount < maxPollTimes) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollCount += 1;

    try {
      const data = await queryVideoStatus(apiKey, taskId);

      if (data.successFlag === 1) {
        const resultUrls = data.response?.resultUrls;
        if (!resultUrls?.length) {
          throw new Error('生成完成但未返回视频链接');
        }
        callbacks.onComplete?.(resultUrls[0]);
        return resultUrls[0];
      }

      if (data.errorMessage) {
        throw new Error(data.errorMessage);
      }

      const progress = Math.min(90, 15 + pollCount * 2);
      callbacks.onProgress?.(progress, `生成中... (${pollCount}/${maxPollTimes})`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      callbacks.onError?.(errorMsg);
      throw error;
    }
  }

  throw new Error('生成超时');
}
```

- 客户端 Hook 串联（`src/lib/hooks/use-video-generation.ts`）：提交 → 轮询 → 下载 → 写入任务结果

```ts
const videoUrl = await pollVideoGeneration(
  options.apiKey,
  taskId,
  {
    onProgress: (progress, status) => {
      updateTaskState(number, { progress, status });
      options.onProgress?.(number, progress, status);
      api.updateVideoTask(number, { progress, status }).catch(console.error);
    },
    onComplete: async (url) => {
      updateTaskState(number, {
        isGenerating: false,
        progress: 100,
        status: '成功',
      });
      options.onComplete?.(number, url);

      await api.updateVideoTask(number, {
        status: '下载中',
        progress: 95,
      });

      const downloadResponse = await fetch('/api/video-tasks/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, url }),
      });
      const result = await downloadResponse.json();

      await api.updateVideoTask(number, {
        status: '成功',
        progress: 100,
        localPath: result.localPath,
        remoteUrl: url,
        actualFilename: result.filename,
        errorMsg: '',
      });
    },
    onError: (error) => {
      updateTaskState(number, { isGenerating: false, progress: task.progress ?? 0, status: '失败' });
      options.onError?.(number, error);
      api.updateVideoTask(number, { status: '失败', errorMsg: error }).catch(console.error);
    },
  },
  120,
  5000,
);
```

### 服务端批量生成与持久化

- 触发入口（`src/app/api/generate/videos/route.ts`）

```ts
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { numbers?: string[] };
    const result = await generateVideos({ numbers: body.numbers });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message || '生成视频失败' },
      { status: 500 },
    );
  }
}
```

- 生成与轮询细节（`src/lib/video-generation.ts`）

```ts
const generateResponse = await fetchJson(
  GENERATE_URL,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    data: payload,
  },
  900_000,
);

const pollData = await fetchJson(
  `${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`,
  {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  },
  900_000,
);

if (payloadData.successFlag === 1) {
  const resultUrls: string[] = payloadData.response?.resultUrls ?? [];
  const { localPath, actualFilename } = await downloadVideo(resultUrls[0], task.number, saveDir);
  await updateVideoTask(task.number, {
    status: '成功', progress: 100, localPath, remoteUrl: resultUrls[0], actualFilename, errorMsg: '',
  });
}
```

- 落盘下载（服务端）

```ts
async function downloadVideo(url: string, number: string, saveDir: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载视频失败: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(finalPath, buffer);
}
```

- 本地下载 API（客户端成功后触发，`src/app/api/video-tasks/download/route.ts`）

```ts
export async function POST(request: Request) {
  const { number, url } = (await request.json()) as { number: string; url: string };
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(finalPath, buffer);
  return NextResponse.json({ success: true, localPath, filename });
}
```

### API Key 获取策略（服务端批量模式）
优先级：
1) 环境变量 `KIE_API_KEY`
2) `videoSettings.apiKey`
3) `keyLibrary` 中平台名为 `kie.ai`/`kie`/`kei`/`kieai` 的 Key
4) 若均缺失则报错

```ts
function pickVideoApiKey(data: AppData): { apiKey: string; source: string } {
  const envKey = process.env.KIE_API_KEY;
  if (envKey?.trim()) return { apiKey: envKey.trim(), source: 'environment' };
  if (data.videoSettings.apiKey?.trim()) return { apiKey: data.videoSettings.apiKey.trim(), source: 'videoSettings' };
  const candidate = Object.values(data.keyLibrary).find((item) => ['kie.ai','kie','kei','kieai'].includes((item.platform||'').toLowerCase()));
  if (candidate) return { apiKey: candidate.apiKey, source: candidate.name };
  throw new Error('未配置 KIE.AI 的 API 密钥');
}
```

### 典型请求示例

- 生成视频（直连 VEO3）

```bash
curl -X POST 'https://api.kie.ai/api/v1/veo/generate' \
  -H 'Authorization: Bearer YOUR_KIE_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{test
  
    "model": "veo3_fast",
    "prompt": "A cinematic drone shot over snowy mountains at sunrise",
    "imageUrls": ["https://example.com/seed.jpg"],
    "aspectRatio": "16:9",
    "watermark": "my-brand",
    "callBackUrl": "https://your.domain/callback",
    "seeds": 123,
    "enableFallback": true,
    "enableTranslation": true
  }'
```

- 任务状态查询（直连 VEO3）

```bash
curl -X GET 'https://api.kie.ai/api/v1/veo/record-info?taskId=YOUR_TASK_ID' \
  -H 'Authorization: Bearer YOUR_KIE_API_KEY'
```

- 批量触发（服务端）

```bash
curl -X POST 'http://localhost:3000/api/generate/videos' \
  -H 'Content-Type: application/json' \
  -d '{"numbers": ["0001","0002"]}'
```

### 返回结果与错误处理

- **生成返回**
  - 成功：`{ code: 200, data: { taskId } }`
  - 客户端/服务端均会校验 `response.ok` 与 `code === 200`，否则抛错
- **轮询返回**
  - 成功条件：`code === 200` 且 `data.successFlag === 1`，读取 `data.response.resultUrls[0]`
  - 错误字段：`data.errorMessage` 存在则直接抛错
  - 超时：达到 `maxPollTimes` 后抛出 “生成超时”
- **下载**
  - 校验下载响应状态码；写入本地失败或网络失败会抛错
- **任务状态与进度**
  - 客户端：`useVideoGeneration` 内通过 `onProgress` 推进状态（上限 90%），完成设为 100%
  - 服务端：`updateVideoTask` 实时写入 `data/app-data.json`，成功时记录 `localPath`、`remoteUrl`、`actualFilename`

### 关键类型

```ts
export interface VideoGenerationResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

export interface VideoRecordResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    successFlag: number;
    response?: {
      resultUrls?: string[];
      resolution?: string;
      seeds?: number[];
    };
    errorMessage?: string | null;
  };
}
```

### 要点与注意
- 必须使用 `Authorization: Bearer <API_KEY>`；服务端批量模式会自动选择密钥来源
- `model` 固定传 `veo3_fast`
- 轮询间隔默认 5s，上限 120 次，可在 `pollVideoGeneration` 调参
- 图片 URL 建议使用稳定的公网图床，避免连接重置
- 生成完成后务必保存视频到本地或你的对象存储（项目默认保存到 `public/generated_videos`）
