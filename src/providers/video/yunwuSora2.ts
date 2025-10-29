import { request } from 'undici';
import type { VideoProvider, SubmitPayload, SubmitResult, QueryResult } from '@/lib/jobs/types/provider';

const CREATE_URL = 'http://yunwu.ai/v1/video/create';
const QUERY_URL = 'http://yunwu.ai/v1/video/query';

type Orientation = 'portrait' | 'landscape' | 'square';

type YunwuSoraCreatePayload = {
  model: string;
  prompt: string;
  images: string[];
  orientation: Orientation;
  size: string;
  duration: number;
  watermark: boolean;
  private: boolean;
};

type YunwuSoraCreateResponse = {
  id?: string;
  status?: string;
  message?: string;
  error?: string;
};

type YunwuSoraQueryResponse = {
  id?: string;
  status?: string;
  video_url?: string | null;
  detail?: {
    status?: string;
    generations?: Array<Record<string, unknown>>;
    pending_info?: {
      status?: string;
      progress_pct?: number;
      failure_reason?: string | null;
      generations?: Array<Record<string, unknown>>;
    };
  };
  error?: string;
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

function mapRatioToOrientation(ratio?: SubmitPayload['ratio']): Orientation {
  switch (ratio) {
    case '16:9':
      return 'landscape';
    case '1:1':
      return 'square';
    case '4:3':
      return 'landscape';
    case '9:16':
    default:
      return 'portrait';
  }
}

function extractVideoUrl(response: YunwuSoraQueryResponse): string | null {
  if (response.video_url) return response.video_url;

  const detail = response.detail ?? {};
  const lookup = (items?: Array<Record<string, unknown>>) => {
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      const url =
        (item.url as string | undefined) ||
        (item.download_url as string | undefined) ||
        (item.file_url as string | undefined);
      if (url) return url;
      const assets = item.assets as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(assets)) {
        for (const asset of assets) {
          const assetUrl =
            (asset.url as string | undefined) ||
            (asset.download_url as string | undefined) ||
            (asset.file_url as string | undefined);
          if (assetUrl) return assetUrl;
        }
      }
    }
    return null;
  };

  return (
    lookup(detail.generations) ||
    lookup(detail.pending_info?.generations)
  );
}

function buildCreatePayload(input: SubmitPayload): YunwuSoraCreatePayload {
  if (!input.prompt) {
    throw new Error('云雾 Sora2 提交需要提示词');
  }

  const preset = (input.extra?.preset ?? {}) as Record<string, unknown>;

  const orientation = (preset.defaultOrientation as Orientation | undefined) ?? mapRatioToOrientation(input.ratio);
  const size = (preset.defaultSize as string | undefined) ?? 'large';
  const durationSource = preset.defaultDuration ?? preset.duration;
  let duration = Number(durationSource ?? 15);
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = 15;
  }

  const watermarkFlag = Boolean(
    typeof preset.defaultWatermarkEnabled === 'boolean' ? preset.defaultWatermarkEnabled : false,
  );

  const privateFlag = typeof preset.defaultPrivate === 'boolean' ? (preset.defaultPrivate as boolean) : true;

  const images: string[] = [];
  if (input.imageUrl) {
    images.push(input.imageUrl);
  }

  return {
    model: 'sora-2',
    prompt: input.prompt,
    images,
    orientation,
    size,
    duration,
    watermark: watermarkFlag,
    private: privateFlag,
  };
}

async function submitJob(payload: YunwuSoraCreatePayload, apiKey: string): Promise<YunwuSoraCreateResponse> {
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
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[云雾 Sora2] ${statusCode} ${text || '创建任务失败'}`);
  }

  try {
    return JSON.parse(text) as YunwuSoraCreateResponse;
  } catch (error) {
    throw new Error(`无法解析云雾 Sora2 创建响应: ${text}`, { cause: error });
  }
}

async function queryJob(taskId: string, apiKey: string): Promise<YunwuSoraQueryResponse> {
  if (!taskId) {
    throw new Error('缺少云雾 Sora2 任务 ID');
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
    bodyTimeout: 25_000,
    headersTimeout: 25_000,
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[云雾 Sora2] 查询失败 ${statusCode}: ${text}`);
  }

  try {
    return JSON.parse(text) as YunwuSoraQueryResponse;
  } catch (error) {
    throw new Error(`无法解析云雾 Sora2 状态响应: ${text}`, { cause: error });
  }
}

function mapStatus(raw?: string): 'queued' | 'running' | 'succeeded' | 'failed' {
  if (!raw) return 'running';
  const value = raw.toLowerCase();
  if (value.includes('fail') || value === 'failed') return 'failed';
  if (value === 'completed' || value === 'success' || value === 'succeeded') return 'succeeded';
  if (value.includes('queue')) return 'queued';
  return 'running';
}

export const yunwuSora2Provider: VideoProvider = {
  async submitJob(input: SubmitPayload, apiKey: string): Promise<SubmitResult> {
    const payload = buildCreatePayload(input);

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await submitJob(payload, apiKey);
        const taskId = response?.id;
        if (!taskId) {
          throw new Error(
            `云雾 Sora2 平台未返回任务 ID: ${JSON.stringify(response)}`,
          );
        }
        return { providerRequestId: taskId };
      } catch (error) {
        lastError = error;
        if (!(attempt < 2 && isTransientError(error))) {
          break;
        }
        const backoff = 500 * Math.pow(1.6, attempt) + Math.random() * 250;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('云雾 Sora2 提交失败');
  },

  async queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult> {
    try {
      const response = await queryJob(providerRequestId, apiKey);
      const topStatus = mapStatus(response.status);

      if (topStatus === 'succeeded') {
        const url = extractVideoUrl(response);
        if (!url) {
          return {
            status: 'failed',
            errorCode: 'NO_RESULT_URL',
            errorMessage: 'Sora2 完成但未返回视频地址',
          };
        }
        return {
          status: 'succeeded',
          progress: 1,
          resultUrl: url,
        };
      }

      if (topStatus === 'failed') {
        return {
          status: 'failed',
          errorCode: 'PROVIDER_ERROR',
          errorMessage:
            response.error ||
            response.detail?.pending_info?.failure_reason ||
            response.detail?.status ||
            '云雾 Sora2 生成失败',
        };
      }

      const detailStatus = mapStatus(response.detail?.status) || mapStatus(response.detail?.pending_info?.status);
      if (detailStatus === 'failed') {
        return {
          status: 'failed',
          errorCode: 'PROVIDER_ERROR',
          errorMessage:
            response.detail?.pending_info?.failure_reason ||
            response.error ||
            response.detail?.status ||
            '云雾 Sora2 生成失败',
        };
      }

      const progressRaw = response.detail?.pending_info?.progress_pct;
      const progress = progressRaw !== undefined ? Math.max(0, Math.min(1, progressRaw > 1 ? progressRaw / 100 : progressRaw)) : undefined;

      return {
        status: topStatus === 'queued' ? 'queued' : 'running',
        progress,
      };
    } catch (error) {
      if (isTransientError(error)) {
        return {
          status: 'running',
        };
      }
      throw error;
    }
  },
};
