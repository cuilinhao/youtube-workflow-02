import { promises as fs } from 'fs';
import path from 'path';
import type { AppData, UpdatePayload } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');

let writeQueue: Promise<unknown> = Promise.resolve();

async function ensureDataFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(DATA_FILE);
  } catch {
    const defaultFile = path.join(process.cwd(), 'data', 'app-data.json');
    const fallback = {
      apiSettings: {
        threadCount: 5,
        retryCount: 3,
        savePath: 'public/generated_images',
        currentKeyName: '',
        apiPlatform: '云雾',
      },
      styleLibrary: {},
      currentStyle: '',
      customStyleContent: '',
      categoryLinks: {},
      keyLibrary: {},
      prompts: [],
      promptNumbers: {},
      videoSettings: {
        apiKey: '',
        savePath: 'public/generated_videos',
        defaultAspectRatio: '9:16',
        defaultWatermark: '',
        defaultCallback: '',
        enableFallback: false,
        enableTranslation: true,
      },
      videoTasks: [],
      generatedImages: {},
      generatedVideos: [],
    } as AppData;

    try {
      const buffer = await fs.readFile(defaultFile, 'utf-8');
      await fs.writeFile(DATA_FILE, buffer, 'utf-8');
    } catch {
      await fs.writeFile(DATA_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    }
  }
}

export async function readAppData(): Promise<AppData> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(raw) as AppData;
}

export async function writeAppData(data: AppData): Promise<void> {
  await ensureDataFile();
  const write = async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  };
  writeQueue = writeQueue.then(write, write);
  await writeQueue;
}

export async function updateAppData(
  updater: (data: AppData) => AppData | void,
): Promise<AppData> {
  const data = await readAppData();
  const updated = (await updater(data)) ?? data;
  await writeAppData(updated);
  return updated;
}

export function applyUpdate<T>(data: AppData, { path: updatePath, value }: UpdatePayload<T>): AppData {
  if (!Array.isArray(updatePath) || updatePath.length === 0) {
    return data;
  }

  const clone: AppData = JSON.parse(JSON.stringify(data));
  type Nested = Record<string, unknown> | unknown[];
  let current: Nested = clone as unknown as Nested;

  for (let i = 0; i < updatePath.length - 1; i += 1) {
    const key = updatePath[i];
    const nextKey = updatePath[i + 1];

    if (Array.isArray(current)) {
      const index = typeof key === 'number' ? key : Number.parseInt(String(key), 10);
      if (!Number.isFinite(index)) {
        throw new Error(`路径 ${key} 在数组中无效`);
      }
      if (current[index] === undefined || current[index] === null || typeof current[index] !== 'object') {
        current[index] = typeof nextKey === 'number' ? [] : {};
      }
      current = current[index] as Nested;
    } else {
      const prop = String(key);
      if (!(prop in current) || typeof (current as Record<string, unknown>)[prop] !== 'object' || (current as Record<string, unknown>)[prop] === null) {
        (current as Record<string, unknown>)[prop] = typeof nextKey === 'number' ? [] : {};
      }
      current = (current as Record<string, unknown>)[prop] as Nested;
    }
  }

  const lastKey = updatePath[updatePath.length - 1];
  if (Array.isArray(current) && typeof lastKey === 'number') {
    current[lastKey] = value as unknown;
  } else if (!Array.isArray(current)) {
    (current as Record<string, unknown>)[String(lastKey)] = value as unknown;
  }
  return clone;
}
