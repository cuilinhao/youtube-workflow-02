import type { AppData, UpdatePayload } from './types';

type NodeFs = typeof import('node:fs/promises');
type NodePath = typeof import('node:path');
type NodeOs = typeof import('node:os');

type NodeModules = {
  fs: NodeFs;
  path: NodePath;
  os: NodeOs;
};

function unwrapDefault<T>(mod: unknown): T {
  const value = mod as { default?: unknown };
  return (value?.default ?? mod) as T;
}

let nodeModulesPromise: Promise<NodeModules | null> | null = null;
async function getNodeModules(): Promise<NodeModules | null> {
  if (!nodeModulesPromise) {
    nodeModulesPromise = (async () => {
      try {
        const [fs, path, os] = await Promise.all([
          import('node:fs/promises'),
          import('node:path'),
          import('node:os'),
        ]);
        return {
          fs,
          path: unwrapDefault<NodePath>(path),
          os: unwrapDefault<NodeOs>(os),
        };
      } catch (error) {
        console.warn('[data-store] Node filesystem modules unavailable, fallback to in-memory store.', error);
        return null;
      }
    })();
  }
  return nodeModulesPromise;
}

let dataFilePathPromise: Promise<string | null> | null = null;
let inMemoryData: AppData | null = null;

let writeQueue: Promise<unknown> = Promise.resolve();

async function writeFileAtomically(mods: NodeModules, targetPath: string, contents: string) {
  const directory = mods.path.dirname(targetPath);
  const tempName = `.tmp-${mods.path.basename(targetPath)}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = mods.path.join(directory, tempName);
  try {
    await mods.fs.writeFile(tempPath, contents, 'utf-8');
    await mods.fs.rename(tempPath, targetPath);
  } catch (error) {
    await mods.fs.rm(tempPath, { force: true }).catch(() => {
      /* noop */
    });
    throw error;
  }
}

function createDefaultAppData(): AppData {
  return {
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
  };
}

function normalizeAppData(raw: unknown): AppData {
  const defaults = createDefaultAppData();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const data = raw as Partial<AppData>;
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  return {
    ...defaults,
    ...data,
    apiSettings: {
      ...defaults.apiSettings,
      ...(isPlainObject(data.apiSettings) ? data.apiSettings : {}),
    },
    videoSettings: {
      ...defaults.videoSettings,
      ...(isPlainObject(data.videoSettings) ? data.videoSettings : {}),
    },
    styleLibrary: isPlainObject(data.styleLibrary) ? (data.styleLibrary as AppData['styleLibrary']) : defaults.styleLibrary,
    categoryLinks: isPlainObject(data.categoryLinks) ? (data.categoryLinks as AppData['categoryLinks']) : defaults.categoryLinks,
    keyLibrary: isPlainObject(data.keyLibrary) ? (data.keyLibrary as AppData['keyLibrary']) : defaults.keyLibrary,
    prompts: Array.isArray(data.prompts) ? data.prompts : defaults.prompts,
    promptNumbers: isPlainObject(data.promptNumbers) ? (data.promptNumbers as AppData['promptNumbers']) : defaults.promptNumbers,
    videoTasks: Array.isArray(data.videoTasks) ? data.videoTasks : defaults.videoTasks,
    generatedImages: isPlainObject(data.generatedImages) ? (data.generatedImages as AppData['generatedImages']) : defaults.generatedImages,
    generatedVideos: Array.isArray(data.generatedVideos) ? data.generatedVideos : defaults.generatedVideos,
    currentStyle: typeof data.currentStyle === 'string' ? data.currentStyle : defaults.currentStyle,
    customStyleContent: typeof data.customStyleContent === 'string' ? data.customStyleContent : defaults.customStyleContent,
  };
}

function needsSchemaRepair(data: Partial<AppData>): boolean {
  return (
    data.apiSettings === undefined ||
    data.videoSettings === undefined ||
    data.styleLibrary === undefined ||
    data.prompts === undefined ||
    data.promptNumbers === undefined ||
    data.keyLibrary === undefined ||
    data.videoTasks === undefined ||
    data.generatedImages === undefined ||
    data.generatedVideos === undefined
  );
}

function getEnvVar(name: string): string | undefined {
  if (typeof process === 'undefined' || !process?.env) {
    return undefined;
  }
  return process.env[name];
}

async function resolveDataFilePath(): Promise<string | null> {
  const mods = await getNodeModules();
  if (!mods) {
    return null;
  }

  const envFile = getEnvVar('YOUTUBE_APP_DATA_FILE')?.trim();
  const envDir = getEnvVar('YOUTUBE_DATA_DIR')?.trim();
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';

  const candidates: string[] = [];
  if (envFile) {
    candidates.push(envFile);
  }
  if (envDir) {
    candidates.push(mods.path.join(envDir, 'app-data.json'));
  }
  if (cwd) {
    candidates.push(mods.path.join(cwd, 'data', 'app-data.json'));
  }
  candidates.push(mods.path.join(mods.os.tmpdir(), 'youtube-workflow', 'app-data.json'));

  const defaultContents = JSON.stringify(createDefaultAppData(), null, 2);
  for (const filePath of candidates) {
    try {
      await mods.fs.mkdir(mods.path.dirname(filePath), { recursive: true });
      await mods.fs.access(filePath).catch(async () => {
        await writeFileAtomically(mods, filePath, defaultContents);
      });
      return filePath;
    } catch (error) {
      console.warn('[data-store] Failed to access data file, trying next candidate:', filePath, error);
    }
  }

  return null;
}

async function ensureDataFile(): Promise<{ mods: NodeModules; filePath: string } | null> {
  if (!dataFilePathPromise) {
    dataFilePathPromise = resolveDataFilePath();
  }
  const filePath = await dataFilePathPromise;
  const mods = await getNodeModules();
  if (!mods || !filePath) {
    return null;
  }
  return { mods, filePath };
}

export async function readAppData(): Promise<AppData> {
  const ensured = await ensureDataFile();
  if (!ensured) {
    inMemoryData ??= createDefaultAppData();
    return inMemoryData;
  }

  try {
    await writeQueue;
  } catch {
    // Ignore write failures here; subsequent read will attempt to continue.
  }

  let raw: string;
  try {
    raw = await ensured.mods.fs.readFile(ensured.filePath, 'utf-8');
  } catch (error) {
    console.error('[data-store] Failed to read app-data.json, fallback to default state', error);
    const fallback = createDefaultAppData();
    inMemoryData = fallback;
    try {
      await writeFileAtomically(ensured.mods, ensured.filePath, JSON.stringify(fallback, null, 2));
    } catch (writeError) {
      console.warn('[data-store] Failed to write fallback app-data.json, keep in-memory only', writeError);
    }
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const normalized = normalizeAppData(parsed);
    inMemoryData = normalized;

    if (needsSchemaRepair(parsed)) {
      try {
        await writeFileAtomically(ensured.mods, ensured.filePath, JSON.stringify(normalized, null, 2));
      } catch (writeError) {
        console.warn('[data-store] Failed to repair app-data.json schema, keep in-memory only', writeError);
      }
    }

    return normalized;
  } catch (error) {
    console.error('[data-store] Failed to parse app-data.json, restoring default state', error);
    const fallback = createDefaultAppData();
    inMemoryData = fallback;
    try {
      await writeFileAtomically(ensured.mods, ensured.filePath, JSON.stringify(fallback, null, 2));
    } catch (writeError) {
      console.warn('[data-store] Failed to write fallback app-data.json, keep in-memory only', writeError);
    }
    return fallback;
  }
}

export async function writeAppData(data: AppData): Promise<void> {
  const ensured = await ensureDataFile();
  inMemoryData = data;
  if (!ensured) {
    return;
  }
  const write = async () => {
    await writeFileAtomically(ensured.mods, ensured.filePath, JSON.stringify(data, null, 2));
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
