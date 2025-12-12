'use client';

const IMAGE_CACHE_NAME = 'video-upload-image-cache-v1';
const METADATA_STORAGE_KEY = 'video-upload-image-cache-metadata';

export interface CachedImageMetadata {
  cacheKey: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

function hasCacheSupport(): boolean {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined';
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readMetadata(): CachedImageMetadata[] {
  const storage = getSessionStorage();
  if (!storage) return [];

  const raw = storage.getItem(METADATA_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as CachedImageMetadata[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMetadata(metadata: CachedImageMetadata[]): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (metadata.length === 0) {
      storage.removeItem(METADATA_STORAGE_KEY);
      return;
    }
    storage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('[image-cache] Failed to persist metadata', error);
  }
}

export function getCachedImageMetadata(): CachedImageMetadata[] {
  return readMetadata();
}

export async function cacheImageFiles(files: File[], batchId: string): Promise<CachedImageMetadata[]> {
  if (!files.length) return [];
  if (!hasCacheSupport()) return [];

  const cache = await window.caches.open(IMAGE_CACHE_NAME);
  const metadataToPersist: CachedImageMetadata[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const encodedName = encodeURIComponent(file.name);
    const cacheKey = `${batchId}/${index}-${encodedName}`;
    const request = new Request(`/__video-upload-cache/${cacheKey}`, { method: 'GET' });

    try {
      await cache.put(
        request,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'Cache-Control': 'no-store',
          },
        }),
      );

      metadataToPersist.push({
        cacheKey,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    } catch (error) {
      console.error('[image-cache] Failed to cache file', { name: file.name, error });
    }
  }

  if (metadataToPersist.length) {
    const existing = readMetadata();
    const merged = [...existing, ...metadataToPersist];
    writeMetadata(merged);
  }

  return metadataToPersist;
}

export async function clearCachedImages(): Promise<void> {
  if (hasCacheSupport()) {
    try {
      await window.caches.delete(IMAGE_CACHE_NAME);
    } catch (error) {
      console.error('[image-cache] Failed to delete cache storage', error);
    }
  }
  writeMetadata([]);
}
