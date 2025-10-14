import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { KeyEntry } from '@/lib/types';

export const runtime = 'nodejs';

interface IncomingKey {
  name: string;
  apiKey: string;
  platform: string;
}

export async function GET() {
  const data = await readAppData();
  return NextResponse.json({ keys: Object.values(data.keyLibrary), current: data.apiSettings.currentKeyName });
}

export async function POST(request: Request) {
  const { name, apiKey, platform } = (await request.json()) as IncomingKey;
  if (!name?.trim() || !apiKey?.trim()) {
    return NextResponse.json({ success: false, message: '名称和密钥不能为空' }, { status: 400 });
  }

  const normalizedName = name.trim();
  const data = await readAppData();

  const now = new Date().toISOString();
  const entry: KeyEntry = {
    name: normalizedName,
    apiKey: apiKey.trim(),
    platform: platform?.trim() || '云雾',
    createdTime: now,
    lastUsed: '从未使用',
  };

  data.keyLibrary[normalizedName] = entry;
  if (!data.apiSettings.currentKeyName) {
    data.apiSettings.currentKeyName = normalizedName;
    data.apiSettings.apiPlatform = entry.platform;
  }

  await writeAppData(data);
  return NextResponse.json({ success: true, key: entry });
}
