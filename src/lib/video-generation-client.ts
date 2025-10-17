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
  const requestBody = {
    model: 'veo3_fast',
    ...payload,
  };
  
  // 打印详细的请求信息到终端
  console.log('\n=== VEO3 客户端请求详细信息 ===');
  console.log('请求URL:', GENERATE_URL);
  console.log('请求方法: POST');
  console.log('请求头:', {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.substring(0, 10)}...`
  });
  console.log('请求体参数:', JSON.stringify(requestBody, null, 2));
  
  // 特别打印图片URL信息
  if (payload.imageUrls && payload.imageUrls.length > 0) {
    console.log('\n=== 客户端上传给VEO3的图片URL ===');
    payload.imageUrls.forEach((url, index) => {
      console.log(`图片 ${index + 1}: ${url}`);
    });
  } else {
    console.log('\n=== 客户端没有图片URL ===');
  }
  
  console.log('==================================\n');

  const response = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    console.log('\n=== VEO3 客户端请求失败 ===');
    console.log('状态码:', response.status);
    console.log('错误信息:', text);
    console.log('==========================\n');
    throw new Error(`生成视频失败 (${response.status}): ${text}`);
  }

  const data: VideoGenerationResponse = await response.json();
  
  // 打印响应信息
  console.log('\n=== VEO3 客户端响应信息 ===');
  console.log('响应数据:', JSON.stringify(data, null, 2));
  console.log('==========================\n');

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

  // 打印状态查询请求信息
  console.log('\n=== VEO3 客户端状态查询请求 ===');
  console.log('查询URL:', url);
  console.log('请求方法: GET');
  console.log('Task ID:', taskId);
  console.log('================================\n');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    console.log('\n=== VEO3 客户端状态查询失败 ===');
    console.log('状态码:', response.status);
    console.log('==================================\n');
    throw new Error(`查询失败 (${response.status})`);
  }

  const data: VideoRecordResponse = await response.json();
  
  // 打印状态查询响应信息
  console.log('\n=== VEO3 客户端状态查询响应 ===');
  console.log('响应数据:', JSON.stringify(data, null, 2));
  console.log('==================================\n');

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