import { readAppData, updateAppData } from '@/lib/data-store';
import type { AppData } from '@/lib/types';

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
    envVarNames.forEach((envName) => {
      const value = process.env[envName]?.trim();
      if (value) {
        entries.push({
          name: `env:${envName}`,
          apiKey: value,
          platform: envName.toLowerCase(),
        });
      }
    });

    const settingEntries = this.options.videoSettingsResolver
      ? this.options.videoSettingsResolver(data.videoSettings)
      : data.videoSettings.apiKey?.trim()
        ? [
            {
              name: 'videoSettings',
              apiKey: data.videoSettings.apiKey.trim(),
              platform: 'videoSettings',
            },
          ]
        : [];

    settingEntries.forEach(({ name, apiKey, platform }) => {
      entries.push({
        name,
        apiKey,
        platform: (platform ?? 'videoSettings').toLowerCase(),
      });
    });

    entries.push(...candidates);

    this.entries = entries;

    if (!this.entries.length) {
      throw new Error(this.options.missingKeyMessage ?? '未配置可用的 API 密钥');
    }
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
