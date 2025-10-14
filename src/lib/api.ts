import type {
  AppData,
  PromptEntry,
  PromptStatus,
  StyleEntry,
  KeyEntry,
  VideoTask,
  ApiSettings,
  VideoSettings,
  ImageReference,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `请求失败 (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getAppData: () => request<AppData>('/api/data'),
  patchAppData: (updates: unknown) =>
    request<AppData>('/api/data', {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    }),
  getPrompts: () => request<{ prompts: PromptEntry[]; mappings: Record<string, string> }>('/api/prompts'),
  addPrompts: (prompts: { prompt: string; number?: string }[]) =>
    request<{ success: boolean; prompts: PromptEntry[] }>('/api/prompts', {
      method: 'POST',
      body: JSON.stringify({ prompts }),
    }),
  updatePrompt: (number: string, payload: Partial<PromptEntry>) =>
    request<{ success: boolean; prompt: PromptEntry }>(`/api/prompts/${encodeURIComponent(number)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removePrompt: (number: string) =>
    request<{ success: boolean }>(`/api/prompts/${encodeURIComponent(number)}`, {
      method: 'DELETE',
    }),
  clearPrompts: () =>
    request<{ success: boolean }>('/api/prompts?scope=all', {
      method: 'DELETE',
    }),
  getKeys: () => request<{ keys: KeyEntry[]; current: string }>('/api/keys'),
  addKey: (key: { name: string; apiKey: string; platform: string }) =>
    request<{ success: boolean; key: KeyEntry }>('/api/keys', {
      method: 'POST',
      body: JSON.stringify(key),
    }),
  updateKey: (name: string, payload: Partial<KeyEntry>) =>
    request<{ success: boolean; key: KeyEntry }>(`/api/keys/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removeKey: (name: string) =>
    request<{ success: boolean }>(`/api/keys/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  getStyles: () =>
    request<{ styles: StyleEntry[]; currentStyle: string; customStyleContent: string }>('/api/styles'),
  upsertStyle: (style: Partial<StyleEntry> & { name: string }) =>
    request<{ success: boolean; style: StyleEntry }>('/api/styles', {
      method: 'POST',
      body: JSON.stringify(style),
    }),
  updateStyle: (name: string, payload: Partial<StyleEntry> & { name?: string }) =>
    request<{ success: boolean; style: StyleEntry }>(`/api/styles/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteStyle: (name: string) =>
    request<{ success: boolean }>(`/api/styles/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  getSettings: () =>
    request<{ apiSettings: ApiSettings; videoSettings: VideoSettings; currentStyle: string; customStyleContent: string }>(
      '/api/settings',
    ),
  updateSettings: (payload: {
    apiSettings?: Partial<ApiSettings>;
    videoSettings?: Partial<VideoSettings>;
    currentStyle?: string;
    customStyleContent?: string;
  }) =>
    request<{ success: boolean; apiSettings: ApiSettings; videoSettings: VideoSettings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getVideoTasks: () => request<{ videoTasks: VideoTask[] }>('/api/video-tasks'),
  addVideoTask: (task: Partial<VideoTask> & { prompt: string }) =>
    request<{ success: boolean; task: VideoTask }>('/api/video-tasks', {
      method: 'POST',
      body: JSON.stringify({ task }),
    }),
  updateVideoTask: (number: string, payload: Partial<VideoTask>) =>
    request<{ success: boolean; task: VideoTask }>(`/api/video-tasks/${encodeURIComponent(number)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removeVideoTask: (number: string) =>
    request<{ success: boolean }>(`/api/video-tasks/${encodeURIComponent(number)}`, {
      method: 'DELETE',
    }),
  clearVideoTasks: () =>
    request<{ success: boolean }>('/api/video-tasks?scope=all', {
      method: 'DELETE',
    }),
  uploadReferenceImage: async (payload: { category: string; name: string; file: File }) => {
    const formData = new FormData();
    formData.append('category', payload.category);
    formData.append('name', payload.name);
    formData.append('file', payload.file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as { success: boolean; image: ImageReference };
  },
  deleteReferenceImage: (category: string, name: string) =>
    request<{ success: boolean }>(`/api/images/${encodeURIComponent(category)}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  createCategory: (name: string) =>
    request<{ success: boolean; category: string }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameCategory: (oldName: string, name: string) =>
    request<{ success: boolean; category: string }>(`/api/categories/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (name: string) =>
    request<{ success: boolean }>(`/api/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  startImageGeneration: (payload: { mode: 'new' | 'selected' | 'all'; numbers?: string[] }) =>
    request<{ success: boolean; message?: string }>('/api/generate/images', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startVideoGeneration: (numbers?: string[]) =>
    request<{ success: boolean; message?: string }>('/api/generate/videos', {
      method: 'POST',
      body: JSON.stringify({ numbers }),
    }),
};

export type { PromptEntry, PromptStatus, StyleEntry, KeyEntry, VideoTask, ApiSettings, VideoSettings, ImageReference };
