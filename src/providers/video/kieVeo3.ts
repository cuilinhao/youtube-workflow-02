import { request } from 'undici';
import type { VideoProvider, SubmitPayload, SubmitResult, QueryResult } from '@/lib/jobs/types/provider';

const GENERATE_URL = 'https://api.kie.ai/api/v1/veo/generate';
const RECORD_URL = 'https://api.kie.ai/api/v1/veo/record-info';

export type VeoGenerateBody = {
  prompt: string;
  imageUrls: string[];
  model: 'veo3_fast' | 'veo3';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  enableTranslation?: boolean;
  enableFallback?: boolean;
  callBackUrl?: string;
  seeds?: number;
};

type SubmitOptions = {
  retries?: number;
  timeoutMs?: number;
};

type VeoGenerateResponse = {
  code?: number;
  msg?: string;
  data?: { taskId?: string };
};

type VeoRecordResponse = {
  code?: number;
  msg?: string;
  data?: {
    successFlag?: number;
    response?: { resultUrls?: string[] };
    errorMessage?: string | null;
    progress?: number;
    status?: string;
  };
};

const TRANSIENT_ERROR = /(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|Socket|timeout)/i;

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = `${error.name}:${error.message}`;
    if (TRANSIENT_ERROR.test(message)) return true;
    const code = (error as Error & { code?: string }).code;
    if (code && TRANSIENT_ERROR.test(code)) return true;
  }
  if (typeof error === 'string') {
    return TRANSIENT_ERROR.test(error);
  }
  return false;
}

function buildGeneratePayload(input: SubmitPayload): VeoGenerateBody {
  if (!input.prompt) {
    throw new Error('缺少生成视频的提示词');
  }

  const payload: VeoGenerateBody = {
    prompt: input.prompt,
    imageUrls: input.imageUrl ? [input.imageUrl] : [],
    model: (input.extra?.model as VeoGenerateBody['model']) ?? 'veo3_fast',
    aspectRatio: (input.ratio as VeoGenerateBody['aspectRatio']) ?? (input.extra?.defaultRatio as VeoGenerateBody['aspectRatio']) ?? '9:16',
    enableFallback: Boolean(input.extra?.enableFallback),
    enableTranslation: input.translate !== 'off',
  };

  if (input.callbackUrl) {
    payload.callBackUrl = input.callbackUrl;
  }

  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) {
    payload.seeds = input.seed;
  }

  return payload;
}

async function submitVeoJob(body: VeoGenerateBody, apiKey: string, options?: SubmitOptions): Promise<VeoGenerateResponse> {
  if (!apiKey) {
    throw new Error('KIE_API_KEY 缺失');
  }
  if (!Array.isArray(body.imageUrls) || body.imageUrls.length === 0) {
    throw new Error('imageUrls is required');
  }
  body.imageUrls.forEach((url) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`invalid image url: ${url}`);
    }
  });

  const retries = Math.max(0, options?.retries ?? 3);
  const timeoutMs = options?.timeoutMs ?? 25_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { statusCode, body: responseBody } = await request(GENERATE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        bodyTimeout: timeoutMs,
        headersTimeout: Math.max(timeoutMs, 10_000),
      });

      const text = await responseBody.text();

      if (statusCode >= 200 && statusCode < 300) {
        try {
          return JSON.parse(text) as VeoGenerateResponse;
        } catch (error) {
          throw new Error(`无法解析 Veo3 响应: ${text}`, { cause: error });
        }
      }

      if (statusCode >= 400 && statusCode < 500) {
        throw new Error(`[Veo3] ${statusCode} ${text}`);
      }

      lastError = new Error(`[Veo3] ${statusCode} ${text}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isTransientError(error)) {
        break;
      }
      const backoff = 500 * Math.pow(1.8, attempt) + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }
    break;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('submitVeoJob failed');
}

async function queryVeoJob(taskId: string, apiKey: string, timeoutMs = 20_000): Promise<VeoRecordResponse> {
  if (!taskId) {
    throw new Error('缺少任务 ID');
  }
  if (!apiKey) {
    throw new Error('KIE_API_KEY 缺失');
  }

  const url = `${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`;
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    bodyTimeout: timeoutMs,
    headersTimeout: Math.max(timeoutMs, 10_000),
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[Veo3] query failed ${statusCode}: ${text}`);
  }

  try {
    return JSON.parse(text) as VeoRecordResponse;
  } catch (error) {
    throw new Error(`无法解析 Veo3 状态响应: ${text}`, { cause: error });
  }
}

export const kieVeo3Provider: VideoProvider = {
  async submitJob(input: SubmitPayload, apiKey: string): Promise<SubmitResult> {
    const payload = buildGeneratePayload(input);

    console.info('[Veo3] 准备提交任务', {
      promptLength: payload.prompt.length,
      imageUrls: payload.imageUrls,
      aspectRatio: payload.aspectRatio,
      model: payload.model,
    });

    const response = await submitVeoJob(payload, apiKey, { retries: 3, timeoutMs: 25_000 });
    const taskId = response?.data?.taskId;
    if (!taskId) {
      throw new Error(`生成接口未返回 taskId: ${JSON.stringify(response)}`);
    }

    console.info('[Veo3] 任务提交成功', { taskId });
    return { providerRequestId: taskId };
  },

  async queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult> {
    const response = await queryVeoJob(providerRequestId, apiKey).catch((error) => {
      if (isTransientError(error)) {
        return { code: 503, msg: (error as Error).message } as VeoRecordResponse;
      }
      throw error;
    });

    if (!response || response.code !== 200) {
      return {
        status: 'queued',
        progress: 0,
      };
    }

    const payload = response.data ?? {};

    if (payload.successFlag === 1) {
      const url = payload.response?.resultUrls?.[0] ?? null;
      return {
        status: 'succeeded',
        progress: 1,
        resultUrl: url,
      };
    }

    if (payload.errorMessage) {
      return {
        status: 'failed',
        errorCode: 'PROVIDER_ERROR',
        errorMessage: payload.errorMessage ?? 'Veo3 返回错误',
      };
    }

    return {
      status: 'running',
      progress: payload.progress ?? 0,
    };
  },
};

export { submitVeoJob };
