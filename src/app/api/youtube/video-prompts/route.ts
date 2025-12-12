import { NextRequest, NextResponse } from 'next/server';
import { VideoPromptsResponse, ApiError, VideoPrompt } from '@youtube/lib/types';
import { validateVideoPrompts } from '@youtube/lib/schema-validation';
import { callOpenRouter, extractJsonArray, normalizeLineEndings, OpenRouterError } from '@youtube/lib/openrouter-client';
import type { ChatMessage } from '@youtube/lib/openrouter-client';

function ensureSequentialShotIds(images: Array<{ shot_id: string }>): boolean {
  return images.every((image, index) => image.shot_id === `shot_${(index + 1).toString().padStart(3, '0')}`);
}

export async function POST(request: NextRequest) {
  try {
    const { script, images } = await request.json();

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '脚本不能为空',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '图片数据不能为空',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const invalidImage = images.find(
      (item) => !item || typeof item !== 'object' || typeof item.shot_id !== 'string' || typeof item.url !== 'string',
    );
    if (invalidImage) {
      const error: ApiError = {
        code: 'E_INVALID_DATA',
        hint: '图片数据格式不正确',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const uniqueShotIds = new Set(images.map((item) => item.shot_id));
    if (uniqueShotIds.size !== images.length) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: '存在重复的 shot_id',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const trimmed = script.trim();
    const truncated = trimmed.length > 4000;
    const effectiveScript = truncated ? trimmed.slice(0, 4000) : trimmed;

    const shotList = images
      .map((image, index) => `镜头${index + 1}：${image.shot_id}（图片 URL：${image.url}）`)
      .join('\n');

    console.info('[VideoPrompts] Incoming request', {
      scriptLength: script.length,
      trimmedLength: trimmed.length,
      truncated,
      imageCount: images.length,
      sequential: ensureSequentialShotIds(images),
    });

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是经验丰富的视频导演。请根据脚本和当前镜头顺序，为每个镜头生成图生视频提示词。' +
          '输出必须是 JSON 数组，仅包含 shot_id 与 image_prompt 字段，顺序与输入镜头完全一致。' +
          'image_prompt 需要使用中文一到两句话描述主角的动作、情绪和镜头氛围，不要包含时长、转场、序号等多余信息。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              '以下是完整脚本（已截断至 4000 字）：\n' +
              `${effectiveScript}\n\n` +
              '镜头顺序：\n' +
              `${shotList}\n\n` +
              '请逐一生成镜头提示词，要求：\n' +
              '1. 使用输入中的 shot_id，保持顺序一致。\n' +
              '2. 每个 image_prompt 为中文，聚焦人物行为、情绪和镜头运动。\n' +
              '3. 不要输出任何额外字段或解释。\n' +
              '4. 使用标准 JSON 数组格式返回结果。',
          },
        ],
      },
    ];

    const raw = await callOpenRouter(messages, {
      maxRetries: 2,
      temperature: 0.2,
      maxTokens: 1536,
    });

    console.info('[VideoPrompts] Model raw response received');

    const jsonText = extractJsonArray(raw);
    const parsed = JSON.parse(jsonText) as VideoPrompt[];

    const promptMap = new Map<string, string>();
    parsed.forEach((item) => {
      if (!item?.shot_id || typeof item.shot_id !== 'string') {
        return;
      }
      if (!promptMap.has(item.shot_id)) {
        promptMap.set(item.shot_id, normalizeLineEndings((item.image_prompt ?? '').trim()).slice(0, 1000));
      }
    });

    const orderedPrompts: VideoPrompt[] = images.map((image) => {
      const prompt = promptMap.get(image.shot_id);
      if (!prompt) {
        console.error('[VideoPrompts] Missing prompt for shot', image.shot_id);
        throw new SyntaxError(`缺少镜头 ${image.shot_id} 的提示词`);
      }
      return {
        shot_id: image.shot_id,
        image_prompt: prompt,
      };
    });

    if (!ensureSequentialShotIds(orderedPrompts)) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: 'shot_id 未按递增顺序排列，请先执行重排编号',
        retryable: true,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const validation = validateVideoPrompts(orderedPrompts);
    if (!validation.valid) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: `Schema验证失败: ${validation.errors.join(', ')}`,
        retryable: false,
      };
      console.error('[VideoPrompts] Schema validation failed', {
        errors: validation.errors,
      });
      return NextResponse.json(error, { status: 400 });
    }

    const response: VideoPromptsResponse = { prompts: orderedPrompts };
    console.info('[VideoPrompts] Returning response', {
      promptCount: orderedPrompts.length,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Video prompts generation error:', error);

    if (error instanceof OpenRouterError) {
      if (error.code === 'rate_limit' || error.status === 429) {
        const apiError: ApiError = {
          code: 'E_MODEL_RATE_LIMIT',
          hint: '模型请求过于频繁，请稍后重试',
          retryable: true,
        };
        console.error('[VideoPrompts] Rate limited', apiError);
        return NextResponse.json(apiError, { status: 429 });
      }

      if (error.code === 'E_TIMEOUT' || error.status === 504) {
        const apiError: ApiError = {
          code: 'E_TIMEOUT',
          hint: '生成视频提示词超时，请稍后重试',
          retryable: true,
        };
        console.error('[VideoPrompts] Timeout', apiError);
        return NextResponse.json(apiError, { status: 504 });
      }

      if (error.code === 'E_OUTPUT_TRUNCATED') {
        const apiError: ApiError = {
          code: 'E_MODEL_OUTPUT_TRUNCATED',
          hint: '模型输出被截断，请重试或精简提示词长度',
          retryable: true,
        };
        console.error('[VideoPrompts] Output truncated', apiError);
        return NextResponse.json(apiError, { status: 502 });
      }

      const apiError: ApiError = {
        code: 'E_INTERNAL_ERROR',
        hint: error.message || '生成视频提示词失败，请稍后重试',
        retryable: true,
      };
      console.error('[VideoPrompts] Model internal error', apiError);
      return NextResponse.json(apiError, { status: 500 });
    }

    if (error instanceof SyntaxError) {
      const apiError: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: error.message || '模型输出解析失败，请重试',
        retryable: true,
      };
      console.error('[VideoPrompts] JSON parse error', apiError);
      return NextResponse.json(apiError, { status: 502 });
    }

    const apiError: ApiError = {
      code: 'E_INTERNAL_ERROR',
      hint: '生成视频提示词时发生内部错误',
      retryable: true,
    };

    console.error('[VideoPrompts] Unknown error', apiError);

    return NextResponse.json(apiError, { status: 500 });
  }
}
