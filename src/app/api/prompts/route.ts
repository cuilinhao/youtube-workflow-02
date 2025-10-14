import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { PromptEntry } from '@/lib/types';

export const runtime = 'nodejs';

interface IncomingPrompt {
  prompt: string;
  number?: string;
}

function nextPromptNumber(existing: PromptEntry[], mappings: Record<string, string>): string {
  const taken = new Set<string>();
  existing.forEach((item) => taken.add(item.number));
  Object.values(mappings).forEach((value) => taken.add(value));

  let counter = existing.length + 1;
  let candidate = String(counter);
  const numericValues = [...taken]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  if (numericValues.length) {
    counter = Math.max(...numericValues) + 1;
  }

  candidate = String(counter);
  while (taken.has(candidate)) {
    counter += 1;
    candidate = String(counter);
  }
  return candidate;
}

export async function GET() {
  const data = await readAppData();
  return NextResponse.json({ prompts: data.prompts, mappings: data.promptNumbers });
}

export async function POST(request: Request) {
  const { prompts } = (await request.json()) as { prompts?: IncomingPrompt[] };
  if (!prompts?.length) {
    return NextResponse.json({ success: false, message: '缺少提示词数据' }, { status: 400 });
  }

  const data = await readAppData();
  const now = new Date().toISOString();
  const created: PromptEntry[] = [];

  for (const item of prompts) {
    const basePrompt = item.prompt?.trim();
    if (!basePrompt) {
      continue;
    }

    const requestedNumber = item.number?.trim();
    let finalNumber = requestedNumber;
    if (!finalNumber || data.prompts.some((p) => p.number === finalNumber)) {
      finalNumber = nextPromptNumber(data.prompts.concat(created), data.promptNumbers);
    }

    const entry: PromptEntry = {
      number: finalNumber,
      prompt: basePrompt,
      status: '等待中',
      createdAt: now,
      updatedAt: now,
    };
    data.prompts.push(entry);
    data.promptNumbers[basePrompt] = finalNumber;
    created.push(entry);
  }

  await writeAppData(data);
  return NextResponse.json({ success: true, prompts: created });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? 'all';

  const data = await readAppData();
  if (scope === 'all') {
    data.prompts = [];
    data.promptNumbers = {};
  }
  await writeAppData(data);

  return NextResponse.json({ success: true });
}
