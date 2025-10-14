import { NextResponse } from 'next/server';
import { readAppData, writeAppData } from '@/lib/data-store';
import type { ApiSettings, VideoSettings } from '@/lib/types';

export const runtime = 'nodejs';

interface SettingsPayload {
  apiSettings?: Partial<ApiSettings>;
  videoSettings?: Partial<VideoSettings>;
  currentStyle?: string;
  customStyleContent?: string;
}

export async function GET() {
  const data = await readAppData();
  return NextResponse.json({
    apiSettings: data.apiSettings,
    videoSettings: data.videoSettings,
    currentStyle: data.currentStyle,
    customStyleContent: data.customStyleContent,
  });
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as SettingsPayload;
  const data = await readAppData();

  if (payload.apiSettings) {
    data.apiSettings = { ...data.apiSettings, ...payload.apiSettings };
  }

  if (payload.videoSettings) {
    data.videoSettings = { ...data.videoSettings, ...payload.videoSettings };
  }

  if (payload.currentStyle !== undefined) {
    data.currentStyle = payload.currentStyle;
    if (payload.currentStyle && data.styleLibrary[payload.currentStyle]) {
      data.styleLibrary[payload.currentStyle].usageCount =
        (data.styleLibrary[payload.currentStyle].usageCount ?? 0) + 1;
    }
  }

  if (payload.customStyleContent !== undefined) {
    data.customStyleContent = payload.customStyleContent;
  }

  await writeAppData(data);
  return NextResponse.json({ success: true, apiSettings: data.apiSettings, videoSettings: data.videoSettings });
}
