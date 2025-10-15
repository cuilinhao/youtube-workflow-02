import { NextRequest, NextResponse } from 'next/server';
import { ReorderResponse, ApiError, GeneratedImage } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();

    // 输入验证
    if (!images || !Array.isArray(images) || images.length === 0) {
      const error: ApiError = {
        code: 'E_EMPTY_INPUT',
        hint: '图片数据不能为空',
        retryable: false
      };
      return NextResponse.json(error, { status: 400 });
    }

    // 验证图片数据结构
    for (const image of images) {
      if (!image.shot_id || !image.url || !image.source) {
        const error: ApiError = {
          code: 'E_INVALID_DATA',
          hint: '图片数据格式不正确',
          retryable: false
        };
        return NextResponse.json(error, { status: 400 });
      }
    }

    // 重排编号逻辑
    const reorderedImages: GeneratedImage[] = [];
    const mapping: { [oldShotId: string]: string } = {};

    console.info('[Reorder] Incoming images', {
      count: images.length,
    });

    images.forEach((image: GeneratedImage, index: number) => {
      const newShotId = `shot_${(index + 1).toString().padStart(3, '0')}`;
      const oldShotId = image.shot_id;
      
      mapping[oldShotId] = newShotId;
      
      reorderedImages.push({
        ...image,
        shot_id: newShotId
      });
    });

    console.info('[Reorder] Reorder completed', {
      newCount: reorderedImages.length,
    });

    const response: ReorderResponse = {
      images: reorderedImages,
      mapping
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Reorder error:', error);
    
    const apiError: ApiError = {
      code: 'E_INTERNAL_ERROR',
      hint: '重排编号时发生内部错误',
      retryable: true
    };

    console.error('[Reorder] Unknown error', apiError);

    return NextResponse.json(apiError, { status: 500 });
  }
}
