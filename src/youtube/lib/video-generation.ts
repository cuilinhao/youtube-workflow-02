import path from 'node:path';
import { readAppData, updateAppData } from './data-store';
import { VideoBatchEngine, type EngineOptions } from '@youtube/lib/jobs/engine/VideoBatchEngine';
import { KeyPool } from '@youtube/lib/jobs/engine/KeyPool';
import { videoTaskToBaseTask, applyBaseTaskToVideoTask } from '@youtube/lib/jobs/engine/videoTaskAdapter';
import { kieVeo3Provider } from '@youtube/providers/video/kieVeo3';
import { yunwuVeo3Provider } from '@youtube/providers/video/yunwuVeo3';
import { yunwuSora2Provider } from '@youtube/providers/video/yunwuSora2';
import { presetA } from '@youtube/providers/video/kieVeo3.presetA';
import { presetB } from '@youtube/providers/video/kieVeo3.presetB';
import type { BaseTask } from '@youtube/lib/jobs/types/job';

type FailedTaskSummary = {
  number: string;
  status: string;
  error: string;
};

export type GenerateVideosResult =
  | {
      success: true;
      succeeded: string[];
      message?: string;
      failed?: FailedTaskSummary[];
    }
  | {
      success: false;
      message: string;
      failed?: FailedTaskSummary[];
    };

export type ProviderKey = 'kie-veo3-fast' | 'yunwu-veo3-fast' | 'yunwu-veo3.1-fast' | 'yunwu-sora2';

interface GenerateVideosPayload {
  numbers?: string[];
  workflow?: 'A' | 'B';
  provider?: ProviderKey;
}

function resolveSaveDir(savePath: string): string {
  if (!savePath) {
    return path.join(process.cwd(), 'public', 'generated_videos');
  }
  return path.isAbsolute(savePath) ? savePath : path.join(process.cwd(), savePath);
}

function pickPreset(workflow: 'A' | 'B') {
  return workflow === 'B' ? presetB : presetA;
}

async function handleTaskUpdate(baseTask: BaseTask) {
  await updateAppData((draft) => {
    const task = draft.videoTasks.find((item) => item.number === baseTask.id);
    if (!task) {
      return draft;
    }
    const next = applyBaseTaskToVideoTask(task, baseTask);
    Object.assign(task, next);
    return draft;
  });
}

export const SUPPORTED_PROVIDERS: ProviderKey[] = ['kie-veo3-fast', 'yunwu-veo3-fast', 'yunwu-veo3.1-fast', 'yunwu-sora2'];

export async function generateVideos({
  numbers,
  workflow = 'A',
  provider: requestedProvider,
}: GenerateVideosPayload): Promise<GenerateVideosResult> {
  const providerKey: ProviderKey = SUPPORTED_PROVIDERS.includes(requestedProvider as ProviderKey)
    ? (requestedProvider as ProviderKey)
    : 'kie-veo3-fast';
  const data = await readAppData();
  const basePreset = pickPreset(workflow);
  const preset: Record<string, unknown> = {
    ...basePreset,
  };

  const isYunwuProvider = providerKey.startsWith('yunwu-');
  const yunwuModel = providerKey === 'yunwu-veo3.1-fast' ? 'veo3.1' : providerKey === 'yunwu-veo3-fast' ? 'veo3-fast' : 'sora-2';

  if (providerKey === 'yunwu-sora2') {
    Object.assign(preset, {
      model: yunwuModel,
      provider: 'yunwu',
      defaultOrientation: 'portrait',
      defaultSize: 'large',
      defaultDuration: 15,
      defaultPrivate: true,
      defaultWatermarkEnabled: false,
    });
  } else if (isYunwuProvider) {
    Object.assign(preset, {
      model: yunwuModel,
      enhancePrompt: true,
      enableUpsample: true,
      provider: 'yunwu',
    });
  } else {
    Object.assign(preset, { provider: 'kie' });
  }

  const threadCount = Math.max(1, data.apiSettings.threadCount ?? 1);
  const maxAttempts = Math.max(1, data.apiSettings.retryCount ?? 3);
  // KIE 接口限流严格，提交时默认在批次之间强制等待 30 秒；云雾侧暂不需要。
  const submitBatchDelayMs = providerKey.startsWith('kie-') ? 30_000 : 0;
  const saveDir = resolveSaveDir(data.videoSettings.savePath);

  const targets = (() => {
    const filtered = numbers?.length
      ? data.videoTasks.filter((item) => numbers.includes(item.number))
      : data.videoTasks;

    return filtered.filter((item) => {
      const scenario = item.workflow ?? 'A';
      const eligibleStatus = ['等待中', '失败', '提交中', '生成中'];
      return scenario === workflow && eligibleStatus.includes(item.status);
    });
  })();

  if (!targets.length) {
    return { success: false, message: '没有需要生成的视频任务' };
  }

  const keyPool = isYunwuProvider
    ? new KeyPool(
        (platform) => platform.includes('云雾') || platform.includes('yunwu') || platform.includes('yun-wu'),
        {
          envVarNames: ['YUNWU_API_KEY'],
          videoSettingsResolver: () => [],
          missingKeyMessage: '未配置可用的云雾平台 API 密钥',
        },
      )
    : new KeyPool(
        (platform) => ['kie.ai', 'kie', 'kei', 'kieai'].includes(platform),
        {
          envVarNames: ['KIE_API_KEY'],
          missingKeyMessage: '未配置可用的 KIE.AI API 密钥',
        },
      );
  await keyPool.init();

  const providerImpl = (() => {
    if (providerKey === 'yunwu-sora2') return yunwuSora2Provider;
    if (providerKey === 'yunwu-veo3-fast' || providerKey === 'yunwu-veo3.1-fast') return yunwuVeo3Provider;
    return kieVeo3Provider;
  })();

  const engineOptions: EngineOptions = {
    provider: providerImpl,
    preset,
    concurrency: threadCount,
    maxAttempts,
    // Runner 会按照该延迟控制批次节奏，避免提交洪峰。
    batchDelayMs: submitBatchDelayMs,
    storage: { baseDir: saveDir, kind: 'local' },
    keyPool,
    onTaskUpdate: handleTaskUpdate,
  };

  const engine = new VideoBatchEngine(engineOptions);

  const baseTasks = targets.map((task) => videoTaskToBaseTask(task, preset));
  await engine.enqueue(baseTasks);
  await engine.run();

  const finalTasks = engine.getTasks();
  if (finalTasks.length) {
    await Promise.all(finalTasks.map(handleTaskUpdate));
  }

  const failedTasks = finalTasks.filter((task) => task.status === 'failed' || task.status === 'timeout');
  const succeededTasks = finalTasks.filter((task) => task.status === 'succeeded');

  if (failedTasks.length) {
    const failedDetails = failedTasks.map((task) => ({
      number: task.id,
      status: task.status,
      error: task.errorMessage ?? '未知错误',
    }));

    if (!succeededTasks.length) {
      return {
        success: false,
        message: '所有视频任务提交失败',
        failed: failedDetails,
      };
    }

    return {
      success: true,
      message: `部分视频任务失败 (${failedTasks.length}/${finalTasks.length})`,
      failed: failedDetails,
      // 返回成功任务编号列表，方便终端日志记录。
      succeeded: succeededTasks.map((task) => task.id),
    };
  }

  // 仅收集成功任务编号，供日志或上游消费。
  const succeededNumbers = succeededTasks.map((task) => task.id);

  return {
    success: true,
    succeeded: succeededNumbers,
  };
}
