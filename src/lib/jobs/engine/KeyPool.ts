import { readAppData, updateAppData } from '@/lib/data-store';

export type KeyPoolEntry = {
  name: string;
  apiKey: string;
  platform: string;
  lastUsed?: string;
};

export class KeyPool {
  private entries: KeyPoolEntry[] = [];

  private index = 0;

  constructor(private readonly platformMatcher: (platform: string) => boolean) {}

  async init() {
    const data = await readAppData();
    const candidates = Object.values(data.keyLibrary).filter((item) =>
      this.platformMatcher((item.platform ?? '').toLowerCase()),
    );

    const entries: KeyPoolEntry[] = [];

    const envKey = process.env.KIE_API_KEY?.trim();
    if (envKey) {
      entries.push({
        name: 'env',
        apiKey: envKey,
        platform: 'environment',
      });
    }

    if (data.videoSettings.apiKey?.trim()) {
      entries.push({
        name: 'videoSettings',
        apiKey: data.videoSettings.apiKey.trim(),
        platform: 'videoSettings',
      });
    }

    entries.push(...candidates);

    this.entries = entries;

    if (!this.entries.length) {
      throw new Error('未配置可用的 KIE.AI API 密钥');
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
