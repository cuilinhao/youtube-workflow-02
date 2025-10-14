import path from 'path';
import { promises as fs } from 'fs';
import pLimit from 'p-limit';
import axios, { type AxiosRequestConfig } from 'axios';
import { readAppData, updateAppData } from './data-store';
import type { AppData, VideoTask } from './types';

const GENERATE_URL = 'https://api.kie.ai/api/v1/veo/generate';
const RECORD_URL = 'https://api.kie.ai/api/v1/veo/record-info';

interface GenerateVideosPayload {
  numbers?: string[];
}

function maskToken(token?: string | null, visible: number = 4) {
  if (!token) return 'N/A';
  if (token.length <= visible * 2) return `${token.slice(0, 2)}***${token.slice(-2)}`;
  return `${token.slice(0, visible)}...${token.slice(-visible)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function resolveSaveDir(savePath: string): string {
  if (!savePath) return path.join(process.cwd(), 'public', 'generated_videos');
  return path.isAbsolute(savePath) ? savePath : path.join(process.cwd(), savePath);
}

function pickVideoApiKey(data: AppData): { apiKey: string; source: string } {
  const envKey = process.env.KIE_API_KEY;
  if (envKey?.trim()) {
    return { apiKey: envKey.trim(), source: 'environment' };
  }

  if (data.videoSettings.apiKey?.trim()) {
    return { apiKey: data.videoSettings.apiKey.trim(), source: 'videoSettings' };
  }

  const candidate = Object.values(data.keyLibrary).find((item) => {
    const normalized = item.platform?.toLowerCase() ?? '';
    return ['kie.ai', 'kie', 'kei', 'kieai'].includes(normalized);
  });

  if (candidate) {
    return { apiKey: candidate.apiKey, source: candidate.name };
  }

  throw new Error('未配置 KIE.AI 的 API 密钥');
}

async function updateVideoTask(number: string, patch: Partial<VideoTask>) {
  await updateAppData((data) => {
    const task = data.videoTasks.find((item) => item.number === number);
    if (task) {
      Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    }
    return data;
  });
}

async function fetchJson<T = Record<string, unknown>>(
  url: string,
  config: AxiosRequestConfig,
  timeoutMs = 900_000,
  retries = 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const method = (config.method ?? 'GET').toUpperCase();
      const headersLog: Record<string, unknown> = {};
      const rawHeaders = config.headers ?? {};
      if (typeof rawHeaders === 'object' && rawHeaders !== null) {
        for (const [key, value] of Object.entries(rawHeaders as Record<string, unknown>)) {
          if (key.toLowerCase() === 'authorization' && typeof value === 'string') {
            headersLog[key] = maskToken(value);
          } else {
            headersLog[key] = value;
          }
        }
      }

      const payloadPreview =
        typeof config.data === 'string'
          ? config.data
          : config.data
            ? JSON.stringify(config.data, null, 2)
            : undefined;

      console.log('[HTTP] 请求开始', {
        attempt,
        retries,
        method,
        url,
        timeoutMs,
        headers: headersLog,
        payload: payloadPreview,
      });

      const response = await axios({
        url,
        ...config,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          ...config.headers,
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status >= 400) {
        const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        throw new Error(`HTTP ${response.status}: ${data}`);
      }

      console.log('[HTTP] 请求成功', {
        url,
        method,
        status: response.status,
        headers: Object.fromEntries(
          Object.entries(response.headers || {}).map(([key, value]) => [key, value]),
        ),
      });

      return response.data as T;
    } catch (error) {
      lastError = error as Error;

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseData = error.response?.data;
        console.error('[HTTP] 请求失败', {
          attempt,
          retries,
          url,
          method: (config.method ?? 'GET').toUpperCase(),
          status,
          code: error.code,
          message: error.message,
          responseData: typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2),
        });
      } else {
        console.error('[HTTP] 未知错误', {
          attempt,
          retries,
          url,
          method: (config.method ?? 'GET').toUpperCase(),
          message: (error as Error).message,
        });
      }

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`请求超时 (${timeoutMs}ms)`);
        }

        if (error.code === 'ECONNRESET') {
          if (attempt < retries) {
            console.log(`[重试 ${attempt}/${retries}] 连接重置，等待 ${attempt * 2}秒后重试...`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
            continue;
          }
          throw new Error(
            `连接被服务器重置，已重试${retries}次。可能原因：图片URL域名被阻止（建议使用postimg.cc等图床）`,
          );
        }

        if (error.response && error.response.status >= 500) {
          if (attempt < retries) {
            console.log(`[重试 ${attempt}/${retries}] 服务器错误，等待后重试...`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            continue;
          }
        }

        if (error.response) {
          const status = error.response.status;
          const data = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
          throw new Error(`HTTP ${status}: ${data}`);
        }

        throw new Error(`网络请求失败 (${error.code || 'unknown'}): ${error.message}`);
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('请求失败');
}

async function downloadVideo(url: string, number: string, saveDir: string): Promise<{ localPath: string; actualFilename: string }> {
  await ensureDir(saveDir);
  const parsedUrl = new URL(url);
  const baseName = path.basename(parsedUrl.pathname || `${number}-${Date.now()}`) || `${number}-${Date.now()}.mp4`;
  const ext = baseName.toLowerCase().endsWith('.mp4') ? '' : '.mp4';
  const timestamp = Date.now();
  const filename = `${number}_${timestamp}_${baseName}${ext}`;
  const finalPath = path.join(saveDir, filename);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载视频失败: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(finalPath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), finalPath);
  return { localPath: path.posix.join(relative), actualFilename: filename };
}

async function processVideoTask(task: VideoTask, apiKey: string, saveDir: string) {
  await updateVideoTask(task.number, { status: '生成中', errorMsg: '', progress: 5 });
  console.log(`[视频任务 ${task.number}] 状态更新 -> 生成中 (progress 5%)`);

  const payload: Record<string, unknown> = {
    prompt: task.prompt,
    imageUrls: task.imageUrls ?? [],
    model: 'veo3_fast',
    aspectRatio: task.aspectRatio ?? '9:16',
    enableFallback: Boolean(task.enableFallback),
    enableTranslation: task.enableTranslation !== false,
  };

  if (task.watermark) payload.watermark = task.watermark;
  if (task.callbackUrl) payload.callBackUrl = task.callbackUrl;
  if (task.seeds) {
    const seedsNumber = Number.parseInt(String(task.seeds), 10);
    if (Number.isFinite(seedsNumber)) {
      payload.seeds = seedsNumber;
    }
  }

  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[视频任务 ${task.number}] ==================== 开始生成 ====================`);
    console.log(`[视频任务 ${task.number}] 提示词: ${task.prompt}`);
    console.log(`[视频任务 ${task.number}] 图片URL: ${task.imageUrls?.[0] || '无'}`);
    console.log(`[视频任务 ${task.number}] 长宽比: ${payload.aspectRatio}`);
    console.log(`[视频任务 ${task.number}] API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
    console.log(`\n[视频任务 ${task.number}] ==================== 请求接口1 ====================`);
    console.log(`[视频任务 ${task.number}] 请求 URL: ${GENERATE_URL}`);
    console.log(`[视频任务 ${task.number}] 请求方法: POST`);
    console.log(`[视频任务 ${task.number}] 请求头:`, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`,
    });
    console.log(`[视频任务 ${task.number}] 请求体:`, JSON.stringify(payload, null, 2));

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

    console.log(`\n[视频任务 ${task.number}] ==================== 接口1响应 ====================`);
    console.log(`[视频任务 ${task.number}] 完整响应:`, JSON.stringify(generateResponse, null, 2));

    const taskId = generateResponse?.data?.taskId;
    if (!taskId) {
      console.error(`[视频任务 ${task.number}] ❌ 错误: 未找到 taskId`);
      console.error(`[视频任务 ${task.number}] 响应结构: response?.data?.taskId = ${taskId}`);
      throw new Error(`生成接口未返回 taskId。响应: ${JSON.stringify(generateResponse)}`);
    }

    console.log(`[视频任务 ${task.number}] ✅ 获取到 taskId: ${taskId}`);
    await updateVideoTask(task.number, { status: '任务已提交，等待处理...', progress: 15 });
    console.log(`[视频任务 ${task.number}] 状态更新 -> 任务已提交，等待处理... (progress 15%)`);

    const pollUrl = `${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`;
    let pollCount = 0;
    const maxPollTimes = 120;
    const pollInterval = 5000;

    console.log(`\n[视频任务 ${task.number}] ==================== 开始轮询 ====================`);
    console.log(`[视频任务 ${task.number}] 轮询 URL: ${pollUrl}`);
    console.log(`[视频任务 ${task.number}] 轮询间隔: ${pollInterval}ms`);
    console.log(`[视频任务 ${task.number}] 最大轮询次数: ${maxPollTimes}\n`);

    while (pollCount < maxPollTimes) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollCount += 1;

      console.log(`[视频任务 ${task.number}] -------------------- 第 ${pollCount} 次轮询 --------------------`);
      console.log(`[视频任务 ${task.number}] 请求 URL: ${pollUrl}`);
      console.log(`[视频任务 ${task.number}] 请求方法: GET`);

      const pollData = await fetchJson(
        pollUrl,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        900_000,
      );

      console.log(`[视频任务 ${task.number}] 轮询响应:`, JSON.stringify(pollData, null, 2));

      if (pollData?.code !== 200) {
        console.log(`[视频任务 ${task.number}] ⏳ code != 200，继续等待...`);
        await updateVideoTask(task.number, {
          status: `生成中... (轮询 ${pollCount})`,
        });
        continue;
      }

      const payloadData = pollData.data ?? {};
      console.log(`[视频任务 ${task.number}] successFlag: ${payloadData.successFlag}`);

      if (payloadData.successFlag === 1) {
        console.log(`[视频任务 ${task.number}] ✅ 视频生成成功！`);
        await updateVideoTask(task.number, { status: '生成完成，开始下载...', progress: 95 });
        console.log(`[视频任务 ${task.number}] 状态更新 -> 生成完成，开始下载... (progress 95%)`);
        const resultUrls: string[] = payloadData.response?.resultUrls ?? [];
        console.log(`[视频任务 ${task.number}] 视频链接:`, resultUrls);
        if (!resultUrls.length) {
          throw new Error('查询接口未返回视频链接');
        }

        console.log(`[视频任务 ${task.number}] 开始下载视频: ${resultUrls[0]}`);
        const { localPath, actualFilename } = await downloadVideo(resultUrls[0], task.number, saveDir);
        console.log(`[视频任务 ${task.number}] ✅ 视频下载完成: ${localPath}`);
        await updateVideoTask(task.number, {
          status: '成功',
          progress: 100,
          localPath,
          remoteUrl: resultUrls[0],
          actualFilename,
          errorMsg: '',
        });
        console.log(`[视频任务 ${task.number}] 状态更新 -> 成功 (progress 100%)`, {
          localPath,
          remoteUrl: resultUrls[0],
          actualFilename,
        });
        console.log(`[视频任务 ${task.number}] ==================== 任务完成 ====================\n`);
        return;
      }

      if (payloadData.errorMessage) {
        console.error(`[视频任务 ${task.number}] ❌ API 返回错误: ${payloadData.errorMessage}`);
        throw new Error(payloadData.errorMessage);
      }

      console.log(`[视频任务 ${task.number}] ⏳ 仍在处理中，继续轮询...`);
      const progressValue = Math.min(90, 15 + pollCount * 2);
      await updateVideoTask(task.number, {
        status: `生成中... (轮询 ${pollCount})`,
        progress: progressValue,
      });
      console.log(`[视频任务 ${task.number}] 状态更新 -> 生成中... (轮询 ${pollCount})`, {
        progress: progressValue,
      });
    }

    throw new Error('轮询超时，未在预期时间内完成视频生成');
  } catch (error) {
    const errorMessage = (error as Error).message || String(error);
    console.error(`[视频任务 ${task.number}] 失败:`, errorMessage);
    console.error(`[视频任务 ${task.number}] 错误堆栈:`, (error as Error).stack);
    await updateVideoTask(task.number, {
      status: '失败',
      errorMsg: errorMessage,
    });
    console.log(`[视频任务 ${task.number}] 状态更新 -> 失败`, { errorMessage });
  }
}

export async function generateVideos({ numbers }: GenerateVideosPayload) {
  const data = await readAppData();
  const { apiSettings, videoTasks: tasks } = data;

  console.log('\n[视频生成] ==================== 任务初始化 ====================');
  console.log('[视频生成] 请求参数', { numbers });
  console.log('[视频生成] 当前任务总数', tasks.length);

  const targets = (() => {
    const filtered = numbers?.length ? tasks.filter((item) => numbers.includes(item.number)) : tasks;
    return filtered.filter((item) => ['等待中', '失败'].includes(item.status));
  })();

  console.log('[视频生成] 目标任务详情', targets.map((item) => ({
    number: item.number,
    status: item.status,
    prompt: item.prompt,
    image: item.imageUrls?.[0],
    aspectRatio: item.aspectRatio,
    enableFallback: item.enableFallback,
    enableTranslation: item.enableTranslation,
  })));

  if (!targets.length) {
    console.log('[视频生成] 无可执行任务，返回提示');
    console.log('[视频生成] ======================================================\n');
    return { success: false, message: '没有需要生成的视频任务' };
  }

  const { apiKey, source } = pickVideoApiKey(data);
  const saveDir = resolveSaveDir(data.videoSettings.savePath);
  const threadCount = Math.max(1, apiSettings.threadCount ?? 1);
  const limit = pLimit(threadCount);

  console.log('[视频生成] 使用的配置', {
    apiKeySource: source,
    apiKeyMasked: maskToken(apiKey),
    saveDir,
    threadCount,
    defaultAspectRatio: data.videoSettings.defaultAspectRatio,
    defaultWatermark: data.videoSettings.defaultWatermark,
    defaultCallback: data.videoSettings.defaultCallback,
  });

  const startedAt = Date.now();

  await Promise.all(
    targets.map((task) =>
      limit(async () => {
        const taskStart = Date.now();
        console.log(`[视频生成] >>>> 并发任务开始 #${task.number}`, {
          number: task.number,
          prompt: task.prompt,
          image: task.imageUrls?.[0],
          status: task.status,
        });
        await processVideoTask(task, apiKey, saveDir);
        console.log(`[视频生成] <<<< 并发任务结束 #${task.number}`, {
          number: task.number,
          durationMs: Date.now() - taskStart,
        });
      }),
    ),
  );

  console.log('[视频生成] 所有任务已完成', {
    durationMs: Date.now() - startedAt,
    count: targets.length,
  });
  console.log('[视频生成] ======================================================\n');

  return { success: true };
}
