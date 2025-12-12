import { readAppData, updateAppData } from '@youtube/lib/data-store';
import type { AppData } from '@youtube/lib/types';

export type KeyPoolEntry = {
  name: string;
  apiKey: string;
  platform: string;
  lastUsed?: string;
};

type KeyPoolOptions = {
  envVarNames?: string[];
  videoSettingsResolver?: (settings: AppData['videoSettings']) => Array<{ name: string; apiKey: string; platform?: string }>;
  missingKeyMessage?: string;
};

// 避免在日志中泄露完整密钥，仅输出部分字符用于排查。
function maskKey(value?: string | null): string {
  if (!value) return 'empty';
  const trimmed = value.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, Math.max(1, trimmed.length - 3))}*** (len=${trimmed.length})`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)} (len=${trimmed.length})`;
}

export class KeyPool {
  private entries: KeyPoolEntry[] = [];

  private index = 0;

  constructor(
    private readonly platformMatcher: (platform: string) => boolean,
    private readonly options: KeyPoolOptions = {},
  ) {}

  async init() {
    const data = await readAppData();
    const candidates = Object.values(data.keyLibrary).filter((item) =>
      this.platformMatcher((item.platform ?? '').toLowerCase()),
    );

    const entries: KeyPoolEntry[] = [];

    const envVarNames = this.options.envVarNames ?? ['KIE_API_KEY'];
    const envVarStatuses: Array<{ env: string; defined: boolean; hasValue: boolean; sample?: string }> = [];

    console.info('[KeyPool] 初始化密钥池', {
      envVarNames,
      keyLibraryTotal: Object.keys(data.keyLibrary ?? {}).length,
      videoSettingsHasKey: Boolean(data.videoSettings.apiKey?.trim()),
    });

    envVarNames.forEach((envName) => {
      const value = process.env[envName]?.trim();
      envVarStatuses.push({
        env: envName,
        defined: typeof process.env[envName] === 'string',
        hasValue: Boolean(value),
        sample: value ? maskKey(value) : undefined,
      });
      console.info('[KeyPool] 检查环境变量', {
        env: envName,
        defined: typeof process.env[envName] === 'string',
        hasValue: Boolean(value),
        sample: value ? maskKey(value) : undefined,
      });
      if (value) {
        entries.push({
          name: `env:${envName}`,
          apiKey: value,
          platform: envName.toLowerCase(),
        });
      }
    });

    const videoSettingsKey = data.videoSettings.apiKey?.trim();

    const settingEntries = this.options.videoSettingsResolver
      ? this.options.videoSettingsResolver(data.videoSettings)
      : videoSettingsKey
        ? [
            {
              name: 'videoSettings',
              apiKey: videoSettingsKey,
              platform: 'videoSettings',
            },
          ]
        : [];

    console.info('[KeyPool] videoSettings/apiKey 来源', {
      fromResolver: Boolean(this.options.videoSettingsResolver),
      providedCount: settingEntries.length,
      sample: settingEntries[0]?.apiKey ? maskKey(settingEntries[0].apiKey) : undefined,
    });

    settingEntries.forEach(({ name, apiKey, platform }) => {
      entries.push({
        name,
        apiKey,
        platform: (platform ?? 'videoSettings').toLowerCase(),
      });
    });

    console.info('[KeyPool] keyLibrary 匹配结果', {
      matched: candidates.length,
      matchedNames: candidates.map((item) => item.name),
      samples: candidates.slice(0, 3).map((item) => maskKey(item.apiKey)),
    });

    entries.push(...candidates);

    this.entries = entries;

    if (!this.entries.length) {
      console.error('[KeyPool] 初始化失败，没有可用密钥', {
        envVarStatuses,
        matchedKeyLibrary: candidates.length,
        videoSettingsProvided: settingEntries.length,
      });
      throw new Error(this.options.missingKeyMessage ?? '未配置可用的 API 密钥');
    }

    console.info('[KeyPool] 初始化完成', {
      total: this.entries.length,
      names: this.entries.map((entry) => entry.name),
      platforms: Array.from(new Set(this.entries.map((entry) => entry.platform))),
    });
  }

  peek(): KeyPoolEntry {
    if (!this.entries.length) {
      throw new Error('未初始化密钥池');
    }
    return this.entries[this.index % this.entries.length];
  }

  pick(): KeyPoolEntry {
    const entry = this.peek();
    this.index = (this.index + 1) % this.entries.length;
    void updateAppData((draft) => {
      if (draft.keyLibrary[entry.name]) {
        draft.keyLibrary[entry.name].lastUsed = new Date().toISOString();
      }
      return draft;
    });
    return entry;
  }
}
