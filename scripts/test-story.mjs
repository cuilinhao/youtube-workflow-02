import { readFile } from 'node:fs/promises';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4.5';

function buildMessages(script) {
  const trimmed = script.trim();
  const truncated = trimmed.length > 4000;
  const effective = truncated ? trimmed.slice(0, 4000) : trimmed;
  const shotCount = Math.min(Math.max(Math.ceil(effective.length / 200) || 1, 16), 32);

  return {
    truncated,
    messages: [
      {
        role: 'system',
        content:
          '你是资深分镜导演，擅长把中文脚本拆解成镜头描述。' +
          '请严格输出 JSON 数组，数组中的每一项仅包含 shot_id 与 image_prompt 字段，' +
          'shot_id 必须从 shot_001 开始按顺序递增且长度一致，image_prompt 需涵盖主体、表情、动作、环境、时间、天气、视角、景别等信息，且使用 LF 换行。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `请基于以下中文脚本生成 ${shotCount} 个镜头描述，最多 42 个，最少 1 个，严格保持 shot_id 顺序：\n\n` +
              `${effective}\n\n` +
              '确保：\n' +
              '1. 输出为 JSON 数组。\n' +
              '2. 所有 shot_id 形如 "shot_001"、"shot_002" ……\n' +
              '3. image_prompt 使用多行文本，段落之间用换行分隔，不要包含额外字段或解释。\n' +
              '4. 每个 image_prompt 不少于 10 个中文字符。',
          },
        ],
      },
    ],
  };
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY 未设置');
  }

  const storyRaw = await readFile(new URL('../public/story.md', import.meta.url), 'utf8');
  const story = storyRaw.split('故事如下：').pop()?.trim() ?? storyRaw.trim();

  const { messages, truncated } = buildMessages(story);

  console.info('[TestStory] Sending request', {
    truncated,
    scriptLength: story.length,
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 2048,
      reasoning: { effort: 'medium' },
    }),
  });

  console.info('[TestStory] Status', response.status);
  const payload = await response.json();
  console.info('[TestStory] Keys', Object.keys(payload));
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('[TestStory] No content returned', payload);
    process.exitCode = 1;
    return;
  }
  console.info('[TestStory] Content preview', JSON.stringify(content).slice(0, 300));

  const textBlocks = Array.isArray(content)
    ? content
        .filter((item) => item?.type === 'text')
        .map((item) => item.text)
        .join('\n')
    : String(content);

  const jsonMatch = textBlocks.match(/```json([\s\S]*?)```/i);
  const jsonText = (jsonMatch ? jsonMatch[1] : textBlocks).trim();
  if (!jsonMatch) {
    console.warn('[TestStory] No fenced json block detected');
  }
  console.info('[TestStory] textBlocks preview', textBlocks.slice(0, 120));

  try {
    const parsed = JSON.parse(jsonText);
    console.info('[TestStory] Parsed shot count', Array.isArray(parsed) ? parsed.length : 'N/A');
  } catch (parseError) {
    console.warn('[TestStory] Unable to parse JSON content', parseError);
  }
}

main().catch((error) => {
  console.error('[TestStory] Error', error);
  process.exitCode = 1;
});
