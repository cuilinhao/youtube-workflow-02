import { NextResponse } from 'next/server';
import { generateImages } from '@/lib/image-generation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mode?: 'new' | 'selected' | 'all'; numbers?: string[] };
    const mode = body.mode ?? 'new';
    const result = await generateImages({ mode, numbers: body.numbers });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('批量出图失败', error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || '批量出图失败' },
      { status: 500 },
    );
  }
}
