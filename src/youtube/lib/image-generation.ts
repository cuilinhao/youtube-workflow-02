import { readAppData, updateAppData } from './data-store';
import type { ImageJob, PromptEntry } from './types';
import { orchestrateGenerateImages } from './images/orchestrator';

export interface GenerateImagesPayload {
  mode: 'new' | 'selected' | 'all';
  numbers?: string[];
}

interface PrepareImageJobsResult {
  jobs: ImageJob[];
  targets: PromptEntry[];
  message?: string;
}

function selectTargets(prompts: PromptEntry[], mode: 'new' | 'selected' | 'all', numbers?: string[]) {
  if (mode === 'new') {
    return prompts.filter((item) => item.status === '等待中');
  }
  if (mode === 'selected') {
    const selectedSet = new Set(numbers ?? []);
    return prompts.filter((item) => selectedSet.has(item.number));
  }
  return [...prompts];
}

export async function prepareImageJobs(payload: GenerateImagesPayload): Promise<PrepareImageJobsResult> {
  const data = await readAppData();
  const prompts = data.prompts ?? [];
  const targets = selectTargets(prompts, payload.mode, payload.numbers);

  if (!targets.length) {
    return { jobs: [], targets, message: '没有需要生成的提示词' };
  }

  const targetNumbers = new Set(targets.map((item) => item.number));
  await updateAppData((draft) => {
    draft.prompts.forEach((prompt) => {
      if (targetNumbers.has(prompt.number)) {
        prompt.status = '等待中';
        prompt.errorMsg = '';
        prompt.progress = 0;
      }
    });
    return draft;
  });

  const jobs: ImageJob[] = targets.map((entry) => ({
    id: entry.number,
    prompt: entry.prompt,
    seed: entry.number,
    meta: {
      promptNumber: entry.number,
      source: 'generate/images',
    },
  }));

  return { jobs, targets };
}

export async function generateImages(payload: GenerateImagesPayload) {
  const { jobs, message } = await prepareImageJobs(payload);
  if (!jobs.length) {
    return { success: false, message, results: [], failed: [] };
  }

  const { results, failed, diagnostics } = await orchestrateGenerateImages(jobs);
  return {
    success: failed.length === 0,
    results,
    failed,
    warnings: diagnostics,
  };
}
