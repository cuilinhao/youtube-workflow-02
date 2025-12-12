export type SubmitPayload = {
  prompt: string;
  imageUrl?: string;
  ratio?: '16:9' | '9:16' | '1:1' | '4:3';
  seed?: number;
  watermark?: string;
  callbackUrl?: string;
  translate?: 'auto' | 'off' | 'zh' | 'en';
  extra?: Record<string, unknown>;
};

export type SubmitResult = {
  providerRequestId: string;
};

export type QueryResult = {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  resultUrl?: string | null;
  errorCode?: string;
  errorMessage?: string;
};

export interface VideoProvider {
  submitJob(input: SubmitPayload, apiKey: string): Promise<SubmitResult>;
  queryJob(providerRequestId: string, apiKey: string): Promise<QueryResult>;
}
