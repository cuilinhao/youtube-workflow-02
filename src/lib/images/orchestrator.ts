import path from 'node:path';
import { promises as fs } from 'node:fs';
import pLimit from 'p-limit';
import type {
  AppData,
  ImageJob,
  ImageReference,
  ImageResult,
  OrchestrateOptions,
  PromptEntry,
} from '@/lib/types';
import { readAppData, updateAppData } from '@/lib/data-store';

const PLATFORM_CONFIGS: Record<string, { url: string; model: string }> = {
  云雾: {
    url: 'https://yunwu.ai/v1/chat/completions',
    model: 'gemini-2.5-flash-image-preview',
  },
  API易: {
    url: 'https://vip.apiyi.com/v1/chat/completions',
    model: 'gemini-2.5-flash-image-preview',
  },
  apicore: {
    url: 'https://api.apicore.ai/v1/chat/completions',
    model: 'gemini-2.5-flash-image',
  },
  'KIE.AI': {
    url: 'https://api.kie.ai/api/v1/chat/completions',
    model: 'gemini-2.5-flash-image-preview',
  },
};

const DEFAULT_TIMEOUT_MS = 600_000;

interface ApiConfig {
  url: string;
  model: string;
  apiKey: string;
  platform: string;
}

interface OrchestratorContext {
  apiConfig: ApiConfig;
  diagnostics: string[];
  imageMap: Map<string, ImageReference>;
  defaultStyle: string;
  appData: AppData;
  saveDir: string;
  concurrency: number;
  retryCount: number;
  timeoutMs: number;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function resolveSaveDir(savePath: string, fallback: string): string {
  if (!savePath) return path.join(process.cwd(), fallback);
  return path.isAbsolute(savePath) ? savePath : path.join(process.cwd(), savePath);
}

function collectImageMap(categoryLinks: AppData['categoryLinks']): Map<string, ImageReference> {
  const map = new Map<string, ImageReference>();
  Object.values(categoryLinks).forEach((items) => {
    items.forEach((item) => {
      if (item.name) {
        map.set(item.name, item);
      }
    });
  });
  return map;
}

function extractImageNames(prompt: string, names: string[]): string[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  return sorted.filter((name) => prompt.includes(name));
}

async function readLocalImageAsBase64(relativePath: string): Promise<string | null> {
  const absolutePath = path.join(
    process.cwd(),
    relativePath.startsWith('public/') ? relativePath : path.join('public', relativePath),
  );
  try {
    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn('[ImagesOrchestrator] Failed to read local reference image', {
      relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function applyStyle(prompt: string, styleContent: string | undefined): string {
  const trimmed = styleContent?.trim();
  if (!trimmed) return prompt;
  return prompt.includes(trimmed) ? prompt : `${prompt}\n${trimmed}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function parseImageFromContent(content: unknown): { base64?: string; url?: string } | null {
  if (typeof content === 'string') {
    const base64Match = content.match(/!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/);
    if (base64Match) {
      return { base64: base64Match[1] };
    }
    const downloadMatch = content.match(/\[点击下载\]\(([^)]+)\)/);
    if (downloadMatch) {
      return { url: downloadMatch[1] };
    }
    const imageMatch = content.match(/!\[[^\]]*\]\((https?:[^)]+)\)/);
    if (imageMatch) {
      return { url: imageMatch[1] };
    }
    return null;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      const parsed = parseImageFromContent(part);
      if (parsed) {
        return parsed;
      }
    }
    return null;
  }

  if (content && typeof content === 'object') {
    const typed = content as {
      type?: string;
      text?: string;
      image_base64?: string;
      image_url?: { url?: string } | string;
      b64_json?: string;
      url?: string;
    };
    if (typed.type === 'output_image' || typed.type === 'image') {
      if (typed.image_base64) {
        const prefix = typed.image_base64.startsWith('data:') ? '' : 'data:image/png;base64,';
        return { base64: `${prefix}${typed.image_base64}` };
      }
      if (typed.b64_json) {
        return { base64: `data:image/png;base64,${typed.b64_json}` };
      }
      if (typeof typed.image_url === 'string') {
        return { url: typed.image_url };
      }
      if (typed.image_url && typeof typed.image_url.url === 'string') {
        return { url: typed.image_url.url };
      }
      if (typed.url) {
        return { url: typed.url };
      }
    }
    if (typed.type === 'text' || typed.type === 'input_text') {
      if (typed.text) {
        return parseImageFromContent(typed.text);
      }
    }
  }
  return null;
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '接口连接超时';
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeCode =
      typeof cause === 'object' && cause !== null && 'code' in (cause as Record<string, unknown>)
        ? ((cause as Record<string, unknown>).code as string | undefined)
        : undefined;
    const code = causeCode ?? ((error as Error & { code?: string }).code ?? '');
    switch (code) {
      case 'ECONNRESET':
        return '网络连接被重置 (ECONNRESET)';
      case 'ENOTFOUND':
        return '无法解析接口域名 (ENOTFOUND)';
      case 'ECONNREFUSED':
        return '接口拒绝连接 (ECONNREFUSED)';
      case 'ETIMEDOUT':
        return '接口连接超时 (ETIMEDOUT)';
      default:
        return error.message || '网络请求失败';
    }
  }
  return '网络请求失败';
}

async function ensureEndpointReachable(url: string, apiKey: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(url, {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    const message = describeNetworkError(error);
    const err = new Error(message);
    (err as Error & { cause?: unknown }).cause = error;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveApiConfig(
  data: AppData,
  excludeKeys: Set<string> = new Set(),
): Promise<{ config: ApiConfig; diagnostics: string[]; keyName: string }> {
  const { apiSettings, keyLibrary } = data;
  const entries = Object.values(keyLibrary);

  if (!entries.length) {
    throw new Error('未配置可用的 API 密钥');
  }

  const preferred = apiSettings.currentKeyName;
  const ordered = preferred
    ? [...entries].sort((a, b) => (a.name === preferred ? -1 : b.name === preferred ? 1 : 0))
    : [...entries];
  const errors: string[] = [];

  for (const entry of ordered) {
    if (excludeKeys.has(entry.name)) {
      continue;
    }
    const platform = entry.platform?.trim() || apiSettings.apiPlatform || '云雾';
    const config = PLATFORM_CONFIGS[platform] ?? PLATFORM_CONFIGS['API易'];
    if (!config) {
      errors.push(`${entry.name}: 不支持的平台 ${platform}`);
      continue;
    }

    try {
      await ensureEndpointReachable(config.url, entry.apiKey);
      console.info('[ImagesOrchestrator] Using API key', {
        name: entry.name,
        platform,
        url: config.url,
      });
      await updateAppData((draft) => {
        draft.apiSettings.currentKeyName = entry.name;
        draft.apiSettings.apiPlatform = platform;
        if (draft.keyLibrary[entry.name]) {
          draft.keyLibrary[entry.name].lastUsed = new Date().toISOString();
        }
        return draft;
      });
      const diagnostics = errors.length ? [...errors, `已自动切换至 ${entry.name}（${platform}）`] : [];
      return {
        config: {
          url: config.url,
          model: config.model,
          apiKey: entry.apiKey,
          platform,
        },
        keyName: entry.name,
        diagnostics,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${entry.name}(${platform}): ${reason}`);
      console.warn('[ImagesOrchestrator] API endpoint unreachable', {
        name: entry.name,
        platform,
        reason,
      });
    }
  }

  throw new Error(`所有可用密钥均无法连接，请检查网络或密钥配置：${errors.join('；')}`);
}

async function updatePrompt(entryNumber: string, patch: Partial<PromptEntry>) {
  await updateAppData((data) => {
    const prompt = data.prompts.find((item) => item.number === entryNumber);
    if (prompt) {
      Object.assign(prompt, patch, { updatedAt: new Date().toISOString() });
    }
    return data;
  });
}

function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'TIMEOUT', message: '接口请求超时' };
  }
  if (error instanceof Error) {
    const message = error.message || '未知错误';
    if (/^接口响应状态码/.test(message)) {
      return { code: 'HTTP_ERROR', message };
    }
    if (message.includes('接口返回内容为空')) {
      return { code: 'EMPTY_CONTENT', message };
    }
    if (message.includes('未在响应中找到图片数据')) {
      return { code: 'NO_IMAGE', message };
    }
    if (message.includes('下载图片失败')) {
      return { code: 'DOWNLOAD_FAILED', message };
    }
    if (message.includes('保存图片失败')) {
      return { code: 'SAVE_FAILED', message };
    }
    return { code: 'GENERAL_ERROR', message };
  }
  return { code: 'UNKNOWN', message: '未知错误' };
}

async function writeImageFromBase64(base64: string, jobId: string, saveDir: string) {
  const [header, data] = base64.split(',', 2);
  const ext =
    header?.includes('image/jpeg') || header?.includes('image/jpg')
      ? '.jpg'
      : header?.includes('image/webp')
        ? '.webp'
        : header?.includes('image/gif')
          ? '.gif'
          : '.png';

  await ensureDir(saveDir);
  const filename = `${jobId}${ext}`;
  const filepath = path.join(saveDir, filename);
  const buffer = Buffer.from(data ?? '', 'base64');
  await fs.writeFile(filepath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), filepath);
  return {
    localPath: path.posix.join(...relative.split(path.sep)),
    actualFilename: filename,
  };
}

async function writeImageFromUrl(url: string, jobId: string, saveDir: string) {
  await ensureDir(saveDir);
  const ext = path.extname(new URL(url).pathname) || '.png';
  const filename = `${jobId}${ext}`;
  const filepath = path.join(saveDir, filename);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(filepath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), filepath);
  return {
    localPath: path.posix.join(...relative.split(path.sep)),
    actualFilename: filename,
  };
}

async function buildMessageContent(
  job: ImageJob,
  promptText: string,
  imageMap: Map<string, ImageReference>,
) {
  const messageContent: Array<Record<string, unknown>> = [{ type: 'text', text: promptText }];
  const explicitRefs = job.refImages ?? [];
  const derivedRefs = extractImageNames(promptText, Array.from(imageMap.keys()));
  const references = Array.from(new Set([...explicitRefs, ...derivedRefs])).filter(Boolean);

  for (const name of references) {
    if (name.startsWith('http://') || name.startsWith('https://') || name.startsWith('data:')) {
      messageContent.push({ type: 'image_url', image_url: { url: name } });
      continue;
    }

    const ref = imageMap.get(name);
    if (!ref) continue;
    if (ref.path) {
      const base64 = await readLocalImageAsBase64(
        ref.path.startsWith('images/') ? path.join('public', ref.path) : ref.path,
      );
      if (base64) {
        messageContent.push({ type: 'image_url', image_url: { url: base64 } });
      }
    } else if (ref.url) {
      messageContent.push({ type: 'image_url', image_url: { url: ref.url } });
    }
  }

  return messageContent;
}

async function processJob(job: ImageJob, context: OrchestratorContext): Promise<ImageResult> {
  const { apiConfig, imageMap, retryCount, timeoutMs } = context;
  const promptNumber = typeof job.meta?.promptNumber === 'string' ? job.meta.promptNumber : undefined;
  const start = Date.now();
  const styleId = typeof job.styleId === 'string' ? job.styleId : undefined;

  let styleContent = context.defaultStyle;
  if (styleId && context.appData.styleLibrary[styleId]?.content) {
    styleContent = context.appData.styleLibrary[styleId].content.trim();
  }

  const promptText = applyStyle(job.prompt, styleContent);
  const messageContent = await buildMessageContent(job, promptText, imageMap);

  const payload = {
    model: apiConfig.model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: messageContent },
    ],
  };

  if (promptNumber) {
    await updatePrompt(promptNumber, {
      status: '生成中',
      errorMsg: '',
      progress: 0,
    });
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retryCount) {
    try {
      const response = await fetchWithTimeout(
        apiConfig.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      );

      if (!response.ok) {
        throw new Error(`接口响应状态码: ${response.status}`);
      }

      const data = (await response.json()) as {
        code?: number;
        msg?: string;
        error?: { message?: string };
        choices?: Array<{ message?: { content?: unknown } }>;
        data?: unknown;
      };

      if (typeof data?.code === 'number' && data.code !== 0) {
        throw new Error(data.msg ? `接口错误(${data.code}): ${data.msg}` : `接口错误代码: ${data.code}`);
      }
      const providerMessage = data?.error?.message;
      if (providerMessage) {
        throw new Error(providerMessage);
      }

      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('接口返回内容为空');
      }

      const result = parseImageFromContent(rawContent);
      if (!result) {
        throw new Error('未在响应中找到图片数据');
      }

      if (promptNumber) {
        await updatePrompt(promptNumber, { status: '下载中', progress: 90 });
      }

      const { localPath, actualFilename } = result.base64
        ? await writeImageFromBase64(result.base64, job.id, context.saveDir)
        : await writeImageFromUrl(result.url!, job.id, context.saveDir);

      const publicUrl = `/${localPath}`;

      if (promptNumber) {
        await updatePrompt(promptNumber, {
          status: '成功',
          localPath,
          imageUrl: result.url,
          actualFilename,
          progress: 100,
          errorMsg: '',
        });
      }

      const elapsed = Date.now() - start;
      console.info('[ImagesOrchestrator] Job completed', {
        jobId: job.id,
        latencyMs: elapsed,
        provider: apiConfig.platform,
        status: 'ok',
      });
      return {
        jobId: job.id,
        ok: true,
        url: publicUrl,
        elapsedMs: elapsed,
      };
    } catch (error) {
      lastError = error as Error;
      attempt += 1;
      if (attempt > retryCount) {
        break;
      }
      if (promptNumber) {
        await updatePrompt(promptNumber, {
          status: '生成中',
          progress: Math.min(80, 20 + attempt * 10),
          errorMsg: `正在重试 (${attempt}/${retryCount}) ...`,
        });
      }
      const wait = Math.min(200 * Math.pow(1.6, attempt - 1), 5_000);
      console.warn('[ImagesOrchestrator] Job retry scheduled', {
        jobId: job.id,
        attempt,
        waitMs: wait,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  if (promptNumber) {
    await updatePrompt(promptNumber, {
      status: '失败',
      errorMsg: lastError?.message ?? '未知错误',
      progress: 0,
    });
  }

  const elapsed = Date.now() - start;
  const classification = classifyError(lastError);
  console.error('[ImagesOrchestrator] Job failed', {
    jobId: job.id,
    latencyMs: elapsed,
    provider: apiConfig.platform,
    errorCode: classification.code,
    message: classification.message,
  });

  return {
    jobId: job.id,
    ok: false,
    error: {
      code: classification.code,
      message: classification.message,
      provider: apiConfig.platform,
    },
    elapsedMs: elapsed,
  };
}

export async function orchestrateGenerateImages(
  jobs: ImageJob[],
  options?: OrchestrateOptions,
): Promise<{ results: ImageResult[]; failed: ImageResult[]; diagnostics?: string[] }> {
  if (!jobs.length) {
    return { results: [], failed: [] };
  }

  const attemptedKeys = new Set<string>();
  const diagnostics: string[] = [];
  const resultsByJob = new Map<string, ImageResult>();
  let pendingJobs = [...jobs];

  while (pendingJobs.length) {
    const appData = await readAppData();
    let configResult: { config: ApiConfig; diagnostics: string[]; keyName: string };

    try {
      configResult = await resolveApiConfig(appData, attemptedKeys);
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法确定可用的 API 配置';
      pendingJobs.forEach((job) => {
        resultsByJob.set(job.id, {
          jobId: job.id,
          ok: false,
          error: { code: 'CONFIG_ERROR', message },
        });
      });
      break;
    }

    const { config: apiConfig, diagnostics: diag, keyName } = configResult;
    if (diag.length) {
      diagnostics.push(...diag);
    }
    attemptedKeys.add(keyName);

    const concurrency = Math.max(1, options?.concurrency ?? appData.apiSettings.threadCount ?? 1);
    const retryCount = options?.retryCount ?? appData.apiSettings.retryCount ?? 0;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const saveDir = resolveSaveDir(appData.apiSettings.savePath, path.join('public', 'generated_images'));
    const imageMap = collectImageMap(appData.categoryLinks);
    const defaultStyle =
      appData.customStyleContent?.trim()
        || (appData.currentStyle && appData.styleLibrary[appData.currentStyle]?.content?.trim())
        || '';

    const context: OrchestratorContext = {
      apiConfig,
      diagnostics,
      imageMap,
      defaultStyle,
      appData,
      saveDir,
      concurrency,
      retryCount,
      timeoutMs,
    };

    const limit = pLimit(concurrency);
    const iterationResults = await Promise.all(pendingJobs.map((job) => limit(() => processJob(job, context))));

    iterationResults.forEach((result) => {
      resultsByJob.set(result.jobId, result);
    });

    const failedResults = iterationResults.filter((result) => !result.ok);
    if (!failedResults.length) {
      break;
    }

    const remainingKeyCount = Object.keys(appData.keyLibrary).length - attemptedKeys.size;
    if (remainingKeyCount <= 0) {
      break;
    }

    const failedJobIds = new Set(failedResults.map((result) => result.jobId));
    pendingJobs = pendingJobs.filter((job) => failedJobIds.has(job.id));
  }

  const orderedResults = jobs.map((job) => {
    const result = resultsByJob.get(job.id);
    if (result) {
      return result;
    }
    return {
      jobId: job.id,
      ok: false,
      error: { code: 'UNKNOWN', message: '任务未完成' },
    };
  });

  const failed = orderedResults.filter((result) => !result.ok);
  return {
    results: orderedResults,
    failed,
    diagnostics: diagnostics.length ? diagnostics : undefined,
  };
}
