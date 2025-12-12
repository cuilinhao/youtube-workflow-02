import type { SubmitPayload } from './provider';

export type BaseTaskStatus =
  | 'pending'
  | 'submitted'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'canceled';

export type BaseTask = {
  id: string;
  status: BaseTaskStatus;
  progress: number;
  input: SubmitPayload;
  providerRequestId?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  fingerprint: string;
  resultUrl?: string;
  localPath?: string;
  actualFilename?: string;
  errorCode?: string;
  errorMessage?: string;
};
