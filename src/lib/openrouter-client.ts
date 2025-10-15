import { setTimeout as delay } from 'node:timers/promises';

export class OpenRouterError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.code = code;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string }>;
}

interface CallOptions {
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL ?? 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5';

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error('未配置 OPENROUTER_API_KEY 环境变量');
  }
  return key;
}

interface TextContent {
  type: 'text';
  text: string;
}

interface OpenRouterChoice {
  message?: { content?: unknown };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

function isTextContent(item: unknown): item is TextContent {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const record = item as Record<string, unknown>;
  return record.type === 'text' && typeof record.text === 'string';
}

function extractTextFromContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter(isTextContent)
      .map((item) => item.text)
      .join('\n')
      .trim();
  }

  if (typeof content === 'string') {
    return content.trim();
  }

  return '';
}

export async function callOpenRouter(messages: ChatMessage[], options: CallOptions = {}): Promise<string> {
  const {
    maxRetries = 2,
    timeoutMs = 90_000,
    temperature = 0.2,
    maxTokens = 2048,
  } = options;

  const apiKey = getApiKey();

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          reasoning: { effort: 'medium' },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        let code: string | undefined;
        let message: string | undefined;
        if (typeof parsed === 'object' && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          const nested = record.error;
          if (typeof nested === 'object' && nested !== null) {
            const nestedRecord = nested as Record<string, unknown>;
            if (typeof nestedRecord.code === 'string') {
              code = nestedRecord.code;
            }
            if (typeof nestedRecord.message === 'string') {
              message = nestedRecord.message;
            }
          }
          if (!code && typeof record.code === 'string') {
            code = record.code;
          }
          if (!message && typeof record.message === 'string') {
            message = record.message;
          }
        }
        const fallbackMessage = (message ?? text) || `请求失败 (${response.status})`;
        throw new OpenRouterError(fallbackMessage, response.status, code);
      }

      const data = (await response.json()) as OpenRouterResponse;
      const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
      const text = extractTextFromContent(choice?.message?.content);
      if (!text) {
        throw new Error('模型返回内容为空');
      }
      return text;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > maxRetries) {
        break;
      }

      const wait = Math.min(200 * Math.pow(1.6, attempt - 1), 5000);
      await delay(wait);
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof OpenRouterError) {
    throw lastError;
  }

  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new OpenRouterError('请求超时', 504, 'E_TIMEOUT');
  }

  throw lastError instanceof Error ? lastError : new Error('未知错误');
}

export function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```json([\s\S]*?)```/i);
  const target = fenceMatch ? fenceMatch[1] : trimmed;

  const start = target.indexOf('[');
  const end = target.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('未找到有效的 JSON 数组');
  }

  return target.slice(start, end + 1);
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
