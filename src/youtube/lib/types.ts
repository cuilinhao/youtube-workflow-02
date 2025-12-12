export type PromptStatus =
  | '等待中'
  | '生成中'
  | '下载中'
  | '成功'
  | '失败';

export interface PromptEntry {
  number: string;
  prompt: string;
  status: PromptStatus;
  imageUrl?: string;
  localPath?: string;
  errorMsg?: string;
  progress?: number;
  actualFilename?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoTask {
  number: string;
  prompt: string;
  imageUrls: string[];
  aspectRatio: string;
  watermark?: string;
  callbackUrl?: string;
  seeds?: string;
  enableFallback: boolean;
  enableTranslation: boolean;
  status: VideoTaskStatus;
  progress: number;
  localPath?: string | null;
  remoteUrl?: string | null;
  errorMsg?: string | null;
  createdAt: string;
  updatedAt?: string;
  workflow?: 'A' | 'B';
  providerRequestId?: string | null;
  fingerprint?: string | null;
  attempts?: number;
  maxAttempts?: number;
  actualFilename?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export type VideoTaskStatus =
  | PromptStatus
  | '提交中'
  | '任务已提交，等待处理...'
  | '生成完成，开始下载...';

export interface StyleEntry {
  name: string;
  content: string;
  category: string;
  createdTime: string;
  usageCount: number;
}

export interface ImageReference {
  name: string;
  path?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KeyEntry {
  name: string;
  apiKey: string;
  platform: string;
  createdTime: string;
  lastUsed: string;
}

export interface ApiSettings {
  threadCount: number;
  retryCount: number;
  savePath: string;
  currentKeyName: string;
  apiPlatform: string;
}

export interface VideoSettings {
  apiKey: string;
  savePath: string;
  defaultAspectRatio: string;
  defaultWatermark: string;
  defaultCallback: string;
  enableFallback: boolean;
  enableTranslation: boolean;
}

// 视频生成工作流相关类型
export interface ShotPrompt {
  shot_id: string;
  image_prompt: string;
}

export interface GeneratedImage {
  shot_id: string;
  url: string;
  source: 'generated' | 'uploaded';
}

export interface VideoPrompt {
  shot_id: string;
  image_prompt: string;
}

export interface FailedItem {
  shot_id: string;
  reason: string;
}

export interface ApiError {
  code: string;
  hint: string;
  retryable?: boolean;
  failed?: FailedItem[];
}

export interface ShotPromptsResponse {
  shots: ShotPrompt[];
}

export interface UploadResponse {
  image: GeneratedImage;
}

export interface ReorderResponse {
  images: GeneratedImage[];
  mapping: { [oldShotId: string]: string };
}

export interface VideoPromptsResponse {
  prompts: VideoPrompt[];
}

export interface AppData {
  apiSettings: ApiSettings;
  styleLibrary: Record<string, StyleEntry>;
  currentStyle: string;
  customStyleContent: string;
  categoryLinks: Record<string, ImageReference[]>;
  keyLibrary: Record<string, KeyEntry>;
  prompts: PromptEntry[];
  promptNumbers: Record<string, string>;
  videoSettings: VideoSettings;
  videoTasks: VideoTask[];
  generatedImages: Record<string, string>;
  generatedVideos: string[];
}

export interface UpdatePayload<T> {
  path: (string | number)[];
  value: T;
}

export interface ImageJob {
  id: string;
  prompt: string;
  aspectRatio?: string;
  refImages?: string[];
  styleId?: string;
  seed?: string | number;
  width?: number;
  height?: number;
  meta?: Record<string, unknown>;
}

export interface OrchestrateOptions {
  concurrency?: number;
  retryCount?: number;
  timeoutMs?: number;
}

export interface ImageResult {
  jobId: string;
  ok: boolean;
  url?: string;
  error?: { code: string; message: string; provider?: string };
  elapsedMs?: number;
}

export interface BatchImagesResponse {
  success: boolean;
  results: ImageResult[];
  failed: ImageResult[];
  images: string[];
}
