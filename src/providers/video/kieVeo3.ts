import axios, { type AxiosRequestConfig } from 'axios';
import type { VideoProvider, SubmitPayload, SubmitResult, QueryResult } from '@/lib/jobs/types/provider';

const GENERATE_URL = 'https://api.kie.ai/api/v1/veo/generate';
const RECORD_URL = 'https://api.kie.ai/api/v1/veo/record-info';

async function requestJson<T>(url: string, config: AxiosRequestConfig, apiKey: string): Promise<T> {
  const response = await axios({
    url,
    ...config,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      ...(config.headers ?? {}),
    },
    timeout: config.timeout ?? 900_000,
    validateStatus: (status) => status < 500,
  });

  if (response.status >= 400) {
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return response.data as T;
}

function buildGeneratePayload(input: SubmitPayload) {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    imageUrls: input.imageUrl ? [input.imageUrl] : [],
    model: (input.extra?.model as string) ?? 'veo3_fast',
    aspectRatio: input.ratio ?? (input.extra?.defaultRatio as string) ?? '9:16',
    enableFallback: Boolean(input.extra?.enableFallback),
    enableTranslation: input.translate !== 'off',
  };

  if (input.watermark) payload.watermark = input.watermark;
  if (input.callbackUrl) payload.callBackUrl = input.callbackUrl;
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) {
    payload.seeds = input.seed;
  }

  return payload;
}

export const kieVeo3Provider: VideoProvider = {
  async submitJob(input: SubmitPayload, apiKey: string): Promise<SubmitResult> {
    const payload = buildGeneratePayload(input);
    const data = await requestJson<{ data?: { taskId?: string } }>(
      GENERATE_URL,
      {
        method: 'POST',
        data: payload,
      },
      apiKey,
    );

    const taskId = data?.data?.taskId;
    if (!taskId) {
      throw new Error('生成接口未返回 taskId');
    }

    return { providerRequestId: taskId };
  },

  async queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult> {
    const pollUrl = `${RECORD_URL}?taskId=${encodeURIComponent(providerRequestId)}`;
    const data = await requestJson<{
      code?: number;
      data?: {
        successFlag?: number;
        response?: { resultUrls?: string[] };
        errorMessage?: string;
        progress?: number;
        status?: string;
      };
    }>(
      pollUrl,
      {
        method: 'GET',
      },
      apiKey,
    );

    if (data?.code !== 200) {
      return { status: 'queued', progress: 0 };
    }

    const payload = data.data ?? {};
    if (payload.successFlag === 1) {
      const url = payload.response?.resultUrls?.[0] ?? null;
      return { status: 'succeeded', progress: 1, resultUrl: url };
    }

    if (payload.errorMessage) {
      return {
        status: 'failed',
        errorCode: 'PROVIDER_ERROR',
        errorMessage: payload.errorMessage,
      };
    }

    return {
      status: 'running',
      progress: payload.progress ?? 0,
    };
  },
};
