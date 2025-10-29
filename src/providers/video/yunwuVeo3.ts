import { request } from 'undici';
import type { VideoProvider, SubmitPayload, SubmitResult, QueryResult } from '@/lib/jobs/types/provider';

const CREATE_URL = 'http://yunwu.ai/v1/video/create';
const QUERY_URL = 'http://yunwu.ai/v1/video/query';

type YunwuCreatePayload = {
  model: string;
  prompt: string;
  images: string[];
  enhance_prompt?: boolean;
  enable_upsample?: boolean;
  aspect_ratio?: string;
};

type YunwuCreateResponse = {
  id?: string;
  status?: string;
  message?: string;
  error?: string;
};

type YunwuQueryResponse = {
  id?: string;
  status?: string;
  message?: string;
  error?: string;
  detail?: {
    status?: string;
    running?: boolean;
    error?: string;
    video_url?: string;
    video_generation_status?: string;
    upsample_status?: string;
    images?: Array<{ status?: string; url?: string }>;
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

function buildCreatePayload(input: SubmitPayload): YunwuCreatePayload {
  if (!input.prompt) {
    throw new Error('云雾平台提交需要提示词');
  }
  if (!input.imageUrl) {
    throw new Error('云雾平台提交需要至少一张参考图');
  }

  const preset = (input.extra?.preset ?? {}) as Record<string, unknown>;
  const model =
    (preset.model as string) ||
    (input.extra?.model as string) ||
    'veo3-fast';

  const aspectRatio = input.ratio ?? (preset.defaultRatio as SubmitPayload['ratio']);
  const enhancePrompt =
    (preset.enhancePrompt as boolean | undefined) ??
    (input.extra?.enhancePrompt as boolean | undefined) ??
    true;
  const enableUpsample =
    (preset.enableUpsample as boolean | undefined) ??
    (input.extra?.enableUpsample as boolean | undefined) ??
    true;

  return {
    model,
    prompt: input.prompt,
    images: [input.imageUrl],
    aspect_ratio: aspectRatio,
    enhance_prompt: enhancePrompt,
    enable_upsample: enableUpsample,
  };
}

async function submitYunwuJob(payload: YunwuCreatePayload, apiKey: string): Promise<YunwuCreateResponse> {
  if (!apiKey) {
    throw new Error('云雾平台 API Key 缺失');
  }

  const { statusCode, body } = await request(CREATE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
    bodyTimeout: 25_000,
    headersTimeout: 25_000,
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[云雾] ${statusCode} ${text || '创建任务失败'}`);
  }

  try {
    return JSON.parse(text) as YunwuCreateResponse;
  } catch (error) {
    throw new Error(`无法解析云雾创建响应: ${text}`, { cause: error });
  }
}

async function queryYunwuJob(taskId: string, apiKey: string): Promise<YunwuQueryResponse> {
  if (!taskId) {
    throw new Error('缺少云雾任务 ID');
  }
  if (!apiKey) {
    throw new Error('云雾平台 API Key 缺失');
  }

  const url = `${QUERY_URL}?id=${encodeURIComponent(taskId)}`;
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    bodyTimeout: 20_000,
    headersTimeout: 20_000,
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[云雾] 查询失败 ${statusCode}: ${text}`);
  }

  try {
    return JSON.parse(text) as YunwuQueryResponse;
  } catch (error) {
    throw new Error(`无法解析云雾状态响应: ${text}`, { cause: error });
  }
}

function isFailedStatus(status?: string): boolean {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower.includes('failed') || lower.includes('error');
}

export const yunwuVeo3Provider: VideoProvider = {
  async submitJob(input: SubmitPayload, apiKey: string): Promise<SubmitResult> {
    const payload = buildCreatePayload(input);

    console.info('[云雾] 准备提交任务', {
      model: payload.model,
      aspectRatio: payload.aspect_ratio,
      imageCount: payload.images.length,
    });

    const response = await submitYunwuJob(payload, apiKey);
    const taskId = response?.id;

    if (!taskId) {
      throw new Error(`云雾平台未返回任务 ID: ${JSON.stringify(response)}`);
    }

    console.info('[云雾] 任务提交成功', { taskId, status: response.status });

    return { providerRequestId: taskId };
  },

  async queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult> {
    try {
      const response = await queryYunwuJob(providerRequestId, apiKey);
      const detail = response.detail ?? {};
      const videoUrl = detail.video_url;

      if (videoUrl) {
        return {
          status: 'succeeded',
          progress: 1,
          resultUrl: videoUrl,
        };
      }

      if (isFailedStatus(detail.status) || isFailedStatus(detail.video_generation_status) || isFailedStatus(response.status)) {
        return {
          status: 'failed',
          errorCode: 'PROVIDER_ERROR',
          errorMessage: detail.error || response.error || response.message || '云雾平台生成失败',
        };
      }

      const running = detail.running ?? true;
    return {
      status: running ? 'running' : 'queued',
      progress: running ? 0.5 : 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('task_not_exist')) {
      return {
        status: 'queued',
        progress: 0,
      };
    }
    if (isTransientError(error)) {
      return {
        status: 'queued',
        progress: 0,
      };
      }
      throw error;
    }
  },
};
