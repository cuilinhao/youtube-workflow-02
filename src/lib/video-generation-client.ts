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

const GENERATE_URL = 'https://api.kie.ai/api/v1/veo/generate';
const RECORD_URL = 'https://api.kie.ai/api/v1/veo/record-info';

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

export interface ProgressCallback {
  onProgress?: (progress: number, status: string) => void;
  onComplete?: (videoUrl: string) => void;
  onError?: (error: string) => void;
}

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