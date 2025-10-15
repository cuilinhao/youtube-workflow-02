import { NextRequest, NextResponse } from 'next/server';
import { UploadResponse, ApiError, GeneratedImage } from '@/lib/types';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '没有上传文件',
        retryable: false
      };
      return NextResponse.json(error, { status: 400 });
    }

    // 文件类型验证
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      const error: ApiError = {
        code: 'E_UPLOAD_TYPE',
        hint: '不支持的文件类型，仅支持 JPEG、PNG、WebP、GIF',
        retryable: false
      };
      return NextResponse.json(error, { status: 400 });
    }

    // 文件大小验证 (10MB限制)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      const error: ApiError = {
        code: 'E_UPLOAD_SIZE',
        hint: '文件大小超过10MB限制',
        retryable: false
      };
      return NextResponse.json(error, { status: 400 });
    }

    // 创建上传目录
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const counterFile = join(uploadDir, '.counter');
    let counter = 0;
    try {
      const raw = await readFile(counterFile, 'utf-8');
      counter = Number.parseInt(raw, 10) || 0;
    } catch {
      counter = 0;
    }
    counter += 1;
    await writeFile(counterFile, String(counter));

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `upload_${timestamp}_${randomId}.${extension}`;
    const filePath = join(uploadDir, fileName);

    // 保存文件
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const shotId = `shot_upload_${counter.toString().padStart(3, '0')}`;

    const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
    const host = request.headers.get('host') ?? 'localhost:3000';
    const origin = `${protocol}://${host}`;
    const imageUrl = `${origin}/uploads/${fileName}`;

    const image: GeneratedImage = {
      shot_id: shotId,
      url: imageUrl,
      source: 'uploaded'
    };

    const response: UploadResponse = { image };

    return NextResponse.json(response);
  } catch (error) {
    console.error('File upload error:', error);
    
    const apiError: ApiError = {
      code: 'E_INTERNAL_ERROR',
      hint: '文件上传时发生内部错误',
      retryable: true
    };
    
    return NextResponse.json(apiError, { status: 500 });
  }
}
