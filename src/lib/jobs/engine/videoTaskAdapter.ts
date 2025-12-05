import type { VideoTask } from '@/lib/types';
import type { BaseTask } from '../types/job';
import type { SubmitPayload } from '../types/provider';
import { computeFingerprint } from './fingerprint';

export function videoTaskToBaseTask(task: VideoTask, preset: Record<string, unknown>): BaseTask {
  const ratio = (task.aspectRatio as SubmitPayload['ratio']) ?? (preset.defaultRatio as SubmitPayload['ratio']);
  const translate: SubmitPayload['translate'] = task.enableTranslation ? 'auto' : 'off';
  const seed = task.seeds ? Number.parseInt(task.seeds, 10) : undefined;

  const input: SubmitPayload = {
    prompt: task.prompt,
    imageUrl: task.imageUrls?.[0],
    ratio,
    seed: Number.isFinite(seed) ? seed : undefined,
    watermark: task.watermark,
    callbackUrl: task.callbackUrl,
    translate,
    extra: {
      enableFallback: task.enableFallback,
      defaultRatio: preset.defaultRatio,
      defaultTranslate: preset.defaultTranslate,
      defaultWatermark: preset.defaultWatermark,
      model: preset.model,
      preset,
    },
  };

  const fingerprint = task.fingerprint ?? computeFingerprint(input);
  const createdAt = Number.parseInt(new Date(task.createdAt).getTime().toString(), 10);
  const updatedAt = task.updatedAt ? new Date(task.updatedAt).getTime() : createdAt;

  return {
    id: task.number,
    status: mapStatusToBase(task.status),
    progress: Math.max(0, Math.min(1, (task.progress ?? 0) / 100)),
    input,
    providerRequestId: task.providerRequestId ?? undefined,
    attempts: task.attempts ?? 0,
    maxAttempts: task.maxAttempts ?? 3,
    createdAt,
    updatedAt,
    fingerprint,
    resultUrl: task.remoteUrl ?? undefined,
    localPath: task.localPath ?? undefined,
    actualFilename: task.actualFilename ?? undefined,
    errorCode: task.errorMsg ? 'PROVIDER_ERROR' : undefined,
    errorMessage: task.errorMsg ?? undefined,
  };
}

export function applyBaseTaskToVideoTask(task: VideoTask, base: BaseTask): VideoTask {
  let status = mapStatusFromBase(base.status);
  if (base.status === 'succeeded' && !base.localPath) {
    status = '下载中';
  }
  const updatedTask: VideoTask = {
    ...task,
    status,
    progress: Math.round((base.progress ?? 0) * 100),
    providerRequestId: base.providerRequestId ?? task.providerRequestId,
    remoteUrl: base.resultUrl ?? task.remoteUrl,
    localPath: base.localPath ?? task.localPath,
    actualFilename: base.actualFilename ?? task.actualFilename,
    errorMsg: base.errorMessage,
    fingerprint: base.fingerprint ?? task.fingerprint,
    attempts: base.attempts,
    maxAttempts: base.maxAttempts,
    updatedAt: new Date(base.updatedAt).toISOString(),
  };

  if (status === '成功') {
    updatedTask.finishedAt = new Date().toISOString();
  } else if (status === '失败') {
    updatedTask.finishedAt = new Date().toISOString();
  } else if (status === '生成中') {
    updatedTask.startedAt = task.startedAt ?? new Date().toISOString();
  }

  return updatedTask;
}

function mapStatusToBase(status: VideoTask['status']): BaseTask['status'] {
  switch (status) {
    case '等待中':
      return 'pending';
    case '生成中':
    case '提交中':
      return 'running';
    case '下载中':
      return 'running';
    case '成功':
      return 'succeeded';
    case '失败':
      return 'failed';
    default:
      return 'pending';
  }
}

function mapStatusFromBase(status: BaseTask['status']): VideoTask['status'] {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'submitted':
    case 'running':
      return '生成中';
    case 'succeeded':
      return '成功';
    case 'failed':
      return '失败';
    case 'timeout':
      return '失败';
    case 'canceled':
      return '失败';
    default:
      return '等待中';
  }
}
