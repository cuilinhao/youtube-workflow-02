import path from 'path';
import { promises as fs } from 'fs';
import pLimit from 'p-limit';
import type { AppData, ImageReference, PromptEntry } from './types';
import { readAppData, updateAppData } from './data-store';

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
    url: 'https://api.kie.ai/v1/chat/completions',
    model: 'gemini-2.5-flash-image-preview',
  },
};

interface GenerateImagesPayload {
  mode: 'new' | 'selected' | 'all';
  numbers?: string[];
}

interface ApiConfig {
  url: string;
  model: string;
  apiKey: string;
  platform: string;
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
  const filePath = path.join(process.cwd(), relativePath.startsWith('public/') ? relativePath : path.join('public', relativePath));
  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
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
    console.warn('读取本地图片失败', relativePath, error);
    return null;
  }
}

function applyStyle(prompt: string, styleContent: string | undefined): string {
  if (!styleContent?.trim()) return prompt;
  return prompt.includes(styleContent.trim()) ? prompt : `${prompt}\n${styleContent.trim()}`;
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

function parseImageFromContent(content: string): { base64?: string; url?: string } | null {
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

async function saveBase64Image(base64: string, number: string, saveDir: string): Promise<{ localPath: string; actualFilename: string }> {
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
  let filename = `${number}${ext}`;
  let counter = 1;
  while (true) {
    const filepath = path.join(saveDir, filename);
    try {
      await fs.access(filepath);
      filename = `${number}-${counter}${ext}`;
      counter += 1;
    } catch {
      break;
    }
  }

  const buffer = Buffer.from(data ?? '', 'base64');
  const finalPath = path.join(saveDir, filename);
  await fs.writeFile(finalPath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), finalPath);
  return { localPath: path.posix.join(relative), actualFilename: filename };
}

async function downloadImage(url: string, number: string, saveDir: string): Promise<{ localPath: string; actualFilename: string }> {
  await ensureDir(saveDir);
  const ext = path.extname(new URL(url).pathname) || '.png';
  let filename = `${number}${ext}`;
  let counter = 1;
  while (true) {
    const filepath = path.join(saveDir, filename);
    try {
      await fs.access(filepath);
      filename = `${number}-${counter}${ext}`;
      counter += 1;
    } catch {
      break;
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const finalPath = path.join(saveDir, filename);
  await fs.writeFile(finalPath, buffer);
  const relative = path.relative(path.join(process.cwd(), 'public'), finalPath);
  return { localPath: path.posix.join(relative), actualFilename: filename };
}

function pickActiveKey(data: AppData): ApiConfig {
  const { apiSettings, keyLibrary } = data;
  let target = apiSettings.currentKeyName ? keyLibrary[apiSettings.currentKeyName] : undefined;
  if (!target) {
    target = Object.values(keyLibrary)[0];
  }
  if (!target) {
    throw new Error('未配置可用的 API 密钥');
  }
  const platform = target.platform?.trim() || apiSettings.apiPlatform || '云雾';
  const config = PLATFORM_CONFIGS[platform] ?? PLATFORM_CONFIGS['API易'];
  return {
    url: config.url,
    model: config.model,
    apiKey: target.apiKey,
    platform,
  };
}

async function updatePrompt(number: string, patch: Partial<PromptEntry>) {
  await updateAppData((data) => {
    const prompt = data.prompts.find((item) => item.number === number);
    if (prompt) {
      Object.assign(prompt, patch, { updatedAt: new Date().toISOString() });
    }
    return data;
  });
}

async function processPrompt(options: {
  entry: PromptEntry;
  apiConfig: ApiConfig;
  retryCount: number;
  imageMap: Map<string, ImageReference>;
  styleContent?: string;
  saveDir: string;
}) {
  const { entry, apiConfig, retryCount, imageMap, styleContent, saveDir } = options;
  const promptText = applyStyle(entry.prompt, styleContent);
  const imageNames = extractImageNames(promptText, Array.from(imageMap.keys()));

  const messageContent: Array<Record<string, unknown>> = [{ type: 'text', text: promptText }];

  for (const name of imageNames) {
    const ref = imageMap.get(name);
    if (!ref) continue;
    if (ref.path) {
      const base64 = await readLocalImageAsBase64(ref.path.startsWith('images/') ? path.join('public', ref.path) : ref.path);
      if (base64) {
        messageContent.push({ type: 'image_url', image_url: { url: base64 } });
      }
    } else if (ref.url) {
      messageContent.push({ type: 'image_url', image_url: { url: ref.url } });
    }
  }

  const payload = {
    model: apiConfig.model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: messageContent },
    ],
  };

  await updatePrompt(entry.number, { status: '生成中', errorMsg: '', progress: 0 });

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
        600_000,
      );

      if (!response.ok) {
        throw new Error(`接口响应状态码: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('接口返回内容为空');
      }

      const result = parseImageFromContent(content);
      if (!result) {
        throw new Error('未在响应中找到图片数据');
      }

      await updatePrompt(entry.number, { status: '下载中', progress: 90 });
      const { localPath, actualFilename } = result.base64
        ? await saveBase64Image(result.base64, entry.number, saveDir)
        : await downloadImage(result.url!, entry.number, saveDir);

      await updatePrompt(entry.number, {
        status: '成功',
        localPath,
        imageUrl: result.url,
        actualFilename,
        progress: 100,
        errorMsg: '',
      });
      return;
    } catch (error) {
      lastError = error as Error;
      attempt += 1;
      if (attempt > retryCount) {
        break;
      }
      await updatePrompt(entry.number, {
        status: '生成中',
        progress: Math.min(80, 20 + attempt * 10),
        errorMsg: `正在重试 (${attempt}/${retryCount}) ...`,
      });
    }
  }

  await updatePrompt(entry.number, {
    status: '失败',
    errorMsg: lastError?.message ?? '未知错误',
    progress: 0,
  });
}

export async function generateImages({ mode, numbers }: GenerateImagesPayload) {
  const data = await readAppData();
  const prompts = data.prompts;

  let targets: PromptEntry[] = [];
  if (mode === 'new') {
    targets = prompts.filter((item) => item.status === '等待中');
  } else if (mode === 'selected') {
    const selectedSet = new Set(numbers ?? []);
    targets = prompts.filter((item) => selectedSet.has(item.number));
  } else {
    targets = [...prompts];
  }

  if (!targets.length) {
    return { success: false, message: '没有需要生成的提示词' };
  }

  const apiConfig = pickActiveKey(data);
  const retryCount = data.apiSettings.retryCount ?? 0;
  const limit = pLimit(Math.max(1, data.apiSettings.threadCount ?? 1));
  const imageMap = collectImageMap(data.categoryLinks);
  const styleContent = data.customStyleContent?.trim()
    || (data.currentStyle && data.styleLibrary[data.currentStyle]?.content?.trim())
    || '';
  const saveDir = resolveSaveDir(data.apiSettings.savePath, path.join('public', 'generated_images'));

  // Reset status if regenerate
  await updateAppData((draft) => {
    draft.prompts.forEach((prompt) => {
      if (targets.find((item) => item.number === prompt.number)) {
        prompt.status = '等待中';
        prompt.errorMsg = '';
        prompt.progress = 0;
      }
    });
    return draft;
  });

  await Promise.all(
    targets.map((entry) =>
      limit(() =>
        processPrompt({
          entry,
          apiConfig,
          retryCount,
          imageMap,
          styleContent,
          saveDir,
        }),
      ),
    ),
  );

  return { success: true };
}
