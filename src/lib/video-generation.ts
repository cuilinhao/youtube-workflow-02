import path from 'node:path';
import { readAppData, updateAppData } from './data-store';
import { VideoBatchEngine, type EngineOptions } from '@/lib/jobs/engine/VideoBatchEngine';
import { KeyPool } from '@/lib/jobs/engine/KeyPool';
import { videoTaskToBaseTask, applyBaseTaskToVideoTask } from '@/lib/jobs/engine/videoTaskAdapter';
import { kieVeo3Provider } from '@/providers/video/kieVeo3';
import { yunwuVeo3Provider } from '@/providers/video/yunwuVeo3';
import { presetA } from '@/providers/video/kieVeo3.presetA';
import { presetB } from '@/providers/video/kieVeo3.presetB';
import type { BaseTask } from '@/lib/jobs/types/job';

type ProviderKey = 'kie-veo3-fast' | 'yunwu-veo3-fast' | 'yunwu-veo3.1-fast';

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

const SUPPORTED_PROVIDERS: ProviderKey[] = ['kie-veo3-fast', 'yunwu-veo3-fast', 'yunwu-veo3.1-fast'];

export async function generateVideos({ numbers, workflow = 'A', provider: requestedProvider }: GenerateVideosPayload) {
  const providerKey: ProviderKey = SUPPORTED_PROVIDERS.includes(requestedProvider as ProviderKey)
    ? (requestedProvider as ProviderKey)
    : 'kie-veo3-fast';
  const data = await readAppData();
  const basePreset = pickPreset(workflow);
  const preset: Record<string, unknown> = {
    ...basePreset,
  };

  const isYunwuProvider = providerKey.startsWith('yunwu-');
  const yunwuModel = providerKey === 'yunwu-veo3.1-fast' ? 'veo3.1' : 'veo3-fast';

  if (isYunwuProvider) {
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

  const engineOptions: EngineOptions = {
    provider: isYunwuProvider ? yunwuVeo3Provider : kieVeo3Provider,
    preset,
    concurrency: threadCount,
    maxAttempts,
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
    };
  }

  return { success: true };
}
