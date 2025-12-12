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
  ImageResult,
  BatchImagesResponse,
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
  getAppData: () => request<AppData>('/api/youtube/data'),
  patchAppData: (updates: unknown) =>
    request<AppData>('/api/youtube/data', {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    }),
  getPrompts: () =>
    request<{ prompts: PromptEntry[]; mappings: Record<string, string> }>('/api/youtube/prompts'),
  addPrompts: (prompts: { prompt: string; number?: string }[]) =>
    request<{ success: boolean; prompts: PromptEntry[] }>('/api/youtube/prompts', {
      method: 'POST',
      body: JSON.stringify({ prompts }),
    }),
  updatePrompt: (number: string, payload: Partial<PromptEntry>) =>
    request<{ success: boolean; prompt: PromptEntry }>(`/api/youtube/prompts/${encodeURIComponent(number)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removePrompt: (number: string) =>
    request<{ success: boolean }>(`/api/youtube/prompts/${encodeURIComponent(number)}`, {
      method: 'DELETE',
    }),
  clearPrompts: () =>
    request<{ success: boolean }>('/api/youtube/prompts?scope=all', {
      method: 'DELETE',
    }),
  getKeys: () => request<{ keys: KeyEntry[]; current: string }>('/api/youtube/keys'),
  addKey: (key: { name: string; apiKey: string; platform: string }) =>
    request<{ success: boolean; key: KeyEntry }>('/api/youtube/keys', {
      method: 'POST',
      body: JSON.stringify(key),
    }),
  updateKey: (name: string, payload: Partial<KeyEntry>) =>
    request<{ success: boolean; key: KeyEntry }>(`/api/youtube/keys/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removeKey: (name: string) =>
    request<{ success: boolean }>(`/api/youtube/keys/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  getStyles: () =>
    request<{ styles: StyleEntry[]; currentStyle: string; customStyleContent: string }>('/api/youtube/styles'),
  upsertStyle: (style: Partial<StyleEntry> & { name: string }) =>
    request<{ success: boolean; style: StyleEntry }>('/api/youtube/styles', {
      method: 'POST',
      body: JSON.stringify(style),
    }),
  updateStyle: (name: string, payload: Partial<StyleEntry> & { name?: string }) =>
    request<{ success: boolean; style: StyleEntry }>(`/api/youtube/styles/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteStyle: (name: string) =>
    request<{ success: boolean }>(`/api/youtube/styles/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  getSettings: () =>
    request<{ apiSettings: ApiSettings; videoSettings: VideoSettings; currentStyle: string; customStyleContent: string }>(
      '/api/youtube/settings',
    ),
  updateSettings: (payload: {
    apiSettings?: Partial<ApiSettings>;
    videoSettings?: Partial<VideoSettings>;
    currentStyle?: string;
    customStyleContent?: string;
  }) =>
    request<{ success: boolean; apiSettings: ApiSettings; videoSettings: VideoSettings }>('/api/youtube/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getVideoTasks: () => request<{ videoTasks: VideoTask[] }>('/api/youtube/video-tasks'),
  addVideoTask: (task: Partial<VideoTask> & { prompt: string }) =>
    request<{ success: boolean; task: VideoTask }>('/api/youtube/video-tasks', {
      method: 'POST',
      body: JSON.stringify({ task }),
    }),
  updateVideoTask: (number: string, payload: Partial<VideoTask>) =>
    request<{ success: boolean; task: VideoTask }>(`/api/youtube/video-tasks/${encodeURIComponent(number)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateVideoTasks: (numbers: string[], payload: { updates: Partial<VideoTask>; resetGeneration?: boolean }) =>
    request<{ success: boolean; tasks: VideoTask[] }>('/api/youtube/video-tasks/batch', {
      method: 'PATCH',
      body: JSON.stringify({ numbers, ...payload }),
    }),
  removeVideoTask: (number: string) =>
    request<{ success: boolean }>(`/api/youtube/video-tasks/${encodeURIComponent(number)}`, {
      method: 'DELETE',
    }),
  clearVideoTasks: () =>
    request<{ success: boolean }>('/api/youtube/video-tasks?scope=all', {
      method: 'DELETE',
    }),
  uploadReferenceImage: async (payload: { category: string; name: string; file: File }) => {
    const formData = new FormData();
    formData.append('category', payload.category);
    formData.append('name', payload.name);
    formData.append('file', payload.file);

    const response = await fetch('/api/youtube/images/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as { success: boolean; image: ImageReference };
  },
  deleteReferenceImage: (category: string, name: string) =>
    request<{ success: boolean }>(`/api/youtube/images/${encodeURIComponent(category)}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  createCategory: (name: string) =>
    request<{ success: boolean; category: string }>('/api/youtube/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameCategory: (oldName: string, name: string) =>
    request<{ success: boolean; category: string }>(`/api/youtube/categories/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (name: string) =>
    request<{ success: boolean }>(`/api/youtube/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  startImageGeneration: (payload: { mode: 'new' | 'selected' | 'all'; numbers?: string[] }) =>
    request<{ success: boolean; results: ImageResult[]; failed: ImageResult[]; warnings?: string[]; message?: string }>(
      '/api/youtube/generate/images',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  startBatchImageGeneration: (payload: { shots: Array<{ shot_id: string; prompt: string }>; aspectRatio?: string }) =>
    request<BatchImagesResponse>('/api/youtube/images/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startVideoGeneration: (input?: string[] | { numbers?: string[]; provider?: string; workflow?: 'A' | 'B' }) => {
    const payload =
      Array.isArray(input) || input === undefined
        ? { numbers: Array.isArray(input) && input.length ? input : undefined }
        : {
            numbers: input.numbers && input.numbers.length ? input.numbers : undefined,
            provider: input.provider,
            workflow: input.workflow,
          };
    return request<{ success: boolean; message?: string }>('/api/youtube/generate/videos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  openFolder: (pathToOpen: string) =>
    request<{ success: boolean; directory?: string; message?: string }>('/api/youtube/system/open-folder', {
      method: 'POST',
      body: JSON.stringify({ path: pathToOpen }),
    }),
};

export type { PromptEntry, PromptStatus, StyleEntry, KeyEntry, VideoTask, ApiSettings, VideoSettings, ImageReference };
