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
    
    // 打印详细的请求信息到终端
    console.log('\n=== VEO3 API 请求详细信息 ===');
    console.log('请求URL:', GENERATE_URL);
    console.log('请求方法: POST');
    console.log('请求头:', {
      'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*'
    });
    console.log('请求体参数:', JSON.stringify(payload, null, 2));
    
    // 特别打印图片URL信息
    if (payload.imageUrls && payload.imageUrls.length > 0) {
      console.log('\n=== 上传给VEO3的图片URL ===');
      payload.imageUrls.forEach((url, index) => {
        console.log(`图片 ${index + 1}: ${url}`);
      });
    } else {
      console.log('\n=== 没有图片URL ===');
    }
    
    console.log('================================\n');

    const data = await requestJson<{ data?: { taskId?: string } }>(
      GENERATE_URL,
      {
        method: 'POST',
        data: payload,
      },
      apiKey,
    );

    // 打印响应信息
    console.log('\n=== VEO3 API 响应信息 ===');
    console.log('响应数据:', JSON.stringify(data, null, 2));
    console.log('===========================\n');

    const taskId = data?.data?.taskId;
    if (!taskId) {
      throw new Error('生成接口未返回 taskId');
    }

    return { providerRequestId: taskId };
  },

  async queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult> {
    const pollUrl = `${RECORD_URL}?taskId=${encodeURIComponent(providerRequestId)}`;
    
    // 打印轮询请求信息
    console.log('\n=== VEO3 状态查询请求 ===');
    console.log('查询URL:', pollUrl);
    console.log('请求方法: GET');
    console.log('Task ID:', providerRequestId);
    console.log('========================\n');
    
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
    
    // 打印轮询响应信息
    console.log('\n=== VEO3 状态查询响应 ===');
    console.log('响应数据:', JSON.stringify(data, null, 2));
    console.log('========================\n');

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
