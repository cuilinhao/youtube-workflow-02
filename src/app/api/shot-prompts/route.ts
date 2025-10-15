import { NextRequest, NextResponse } from 'next/server';
import { ShotPromptsResponse, ApiError, ShotPrompt } from '@/lib/types';
import { validateShotPrompts } from '@/lib/schema-validation';
import { callOpenRouter, extractJsonArray, normalizeLineEndings, OpenRouterError } from '@/lib/openrouter-client';

export async function POST(request: NextRequest) {
  try {
    const { script } = await request.json();

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '脚本不能为空',
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const trimmed = script.trim();
    const truncated = trimmed.length > 4000;
    const effectiveScript = truncated ? trimmed.slice(0, 4000) : trimmed;

    const estimatedShots = Math.ceil(effectiveScript.length / 200);
    const shotCount = Math.min(Math.max(estimatedShots || 1, 16), 32);

    const messages = [
      {
        role: 'system' as const,
        content:
          '你是资深分镜导演，擅长把中文脚本拆解成镜头描述。' +
          '请严格输出 JSON 数组，数组中的每一项仅包含 shot_id 与 image_prompt 字段，' +
          'shot_id 必须从 shot_001 开始按顺序递增且长度一致，image_prompt 需涵盖主体、表情、动作、环境、时间、天气、视角、景别等信息，且使用 LF 换行。',
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text:
              `请基于以下中文脚本生成 ${shotCount} 个镜头描述，最多 32 个，最少 16 个，严格保持 shot_id 顺序：\n\n` +
              `${effectiveScript}\n\n` +
              '确保：\n' +
              '1. 输出为 JSON 数组。\n' +
              '2. 所有 shot_id 形如 "shot_001"、"shot_002" ……。\n' +
              '3. image_prompt 使用多行文本，段落之间用换行分隔，不要包含额外字段或解释。\n' +
              '4. 每个 image_prompt 不少于 10 个中文字符。',
          },
        ],
      },
    ];

    const raw = await callOpenRouter(messages, {
      maxRetries: 2,
      temperature: 0.15,
      maxTokens: 2048,
    });

    const jsonText = extractJsonArray(raw);
    let parsed = JSON.parse(jsonText) as ShotPrompt[];

    parsed = parsed.map((shot, index) => ({
      shot_id: `shot_${(index + 1).toString().padStart(3, '0')}`,
      image_prompt: normalizeLineEndings((shot.image_prompt ?? '').trim()).slice(0, 4000),
    }));

    if (parsed.length < 16 || parsed.length > 32) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: `镜头数量不符合规范，应在16至32之间，实际为${parsed.length}`,
        retryable: true,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const validation = validateShotPrompts(parsed);
    if (!validation.valid) {
      const error: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: `Schema验证失败: ${validation.errors.join(', ')}`,
        retryable: false,
      };
      return NextResponse.json(error, { status: 400 });
    }

    const response: ShotPromptsResponse = { shots: parsed };
    const headers = truncated ? { 'X-Input-Truncated': 'true' } : undefined;

    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error('Shot prompts generation error:', error);

    if (error instanceof OpenRouterError) {
      if (error.code === 'rate_limit' || error.status === 429) {
        const apiError: ApiError = {
          code: 'E_MODEL_RATE_LIMIT',
          hint: '模型请求过于频繁，请稍后重试',
          retryable: true,
        };
        return NextResponse.json(apiError, { status: 429 });
      }

      if (error.code === 'E_TIMEOUT' || error.status === 504) {
        const apiError: ApiError = {
          code: 'E_TIMEOUT',
          hint: '生成分镜超时，请稍后重试',
          retryable: true,
        };
        return NextResponse.json(apiError, { status: 504 });
      }

      const apiError: ApiError = {
        code: 'E_INTERNAL_ERROR',
        hint: error.message || '生成分镜失败，请稍后重试',
        retryable: true,
      };
      return NextResponse.json(apiError, { status: 500 });
    }

    if (error instanceof SyntaxError) {
      const apiError: ApiError = {
        code: 'E_JSON_SCHEMA',
        hint: '模型输出解析失败，请重试',
        retryable: true,
      };
      return NextResponse.json(apiError, { status: 502 });
    }

    const apiError: ApiError = {
      code: 'E_INTERNAL_ERROR',
      hint: '生成分镜时发生内部错误',
      retryable: true,
    };

    return NextResponse.json(apiError, { status: 500 });
  }
}
