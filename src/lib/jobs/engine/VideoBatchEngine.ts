import { parseVideoCsv, serializeVideoCsv, type CsvRecord } from '../csv/csvIO';
import type { SubmitPayload, VideoProvider } from '../types/provider';
import type { BaseTask } from '../types/job';
import { computeFingerprint } from './fingerprint';
import { JobQueue } from './JobQueue';
import { Runner } from './Runner';
import { Poller } from './Poller';
import { downloadVideoFile } from './Downloader';
import { KeyPool } from './KeyPool';

export type EngineStorageOptions = {
  baseDir: string;
  kind: 'local' | 'r2' | 's3';
};

export type EngineOptions = {
  provider: VideoProvider;
  preset: Record<string, unknown>;
  concurrency?: number;
  maxAttempts?: number;
  storage: EngineStorageOptions;
  keyPool: KeyPool;
  onTaskUpdate?: (task: BaseTask) => void | Promise<void>;
};

export class VideoBatchEngine {
  private readonly queue: JobQueue;

  private readonly runner: Runner;

  private readonly poller: Poller;

  constructor(private readonly options: EngineOptions) {
    this.queue = new JobQueue(options.onTaskUpdate);

    const concurrency = Math.max(1, options.concurrency ?? 5);
    const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

    this.runner = new Runner({
      concurrency,
      maxAttempts,
      provider: options.provider,
      queue: this.queue,
      keyPool: options.keyPool,
    });

    this.poller = new Poller({
      provider: options.provider,
      queue: this.queue,
      keyPool: options.keyPool,
    });
  }

  async importFromCsv(input: string | Buffer): Promise<BaseTask[]> {
    const text = typeof input === 'string' ? input : input.toString('utf-8');
    const records = parseVideoCsv(text);
    return records.map((record) => this.createTaskFromCsv(record));
  }

  async enqueue(tasks: BaseTask[]): Promise<void> {
    const skippable: BaseTask[] = [];
    const insertable: BaseTask[] = [];
    tasks.forEach((task) => {
      const existing = this.queue.findByFingerprint(task.fingerprint);
      if (existing && existing.status === 'succeeded') {
        skippable.push({ ...existing });
      } else {
        insertable.push(task);
      }
    });

    if (insertable.length) {
      this.queue.enqueue(insertable);
      if (this.options.onTaskUpdate) {
        await Promise.all(insertable.map((task) => this.options.onTaskUpdate?.(task)));
      }
    }
  }

  async run(): Promise<void> {
    await this.runner.submitPendingTasks();
    await this.poller.pollUntilComplete();

    const succeeded = this.queue.list().filter((task) => task.status === 'succeeded' && task.resultUrl);
    await Promise.all(
      succeeded.map(async (task) => {
        try {
          const { localPath, actualFilename } = await downloadVideoFile({
            baseDir: this.options.storage.baseDir,
            taskId: task.id,
            input: {
              prompt: task.input.prompt,
              imageUrl: task.input.imageUrl,
            },
            url: task.resultUrl!,
          });
          this.queue.update(task.id, {
            localPath,
            resultUrl: task.resultUrl,
            actualFilename,
            status: 'succeeded',
            progress: 1,
            errorCode: undefined,
            errorMessage: undefined,
          });
        } catch (error) {
          console.error('[VideoBatchEngine] 下载失败', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
          this.queue.update(task.id, {
            status: 'failed',
            errorCode: 'DOWNLOAD_ERROR',
            errorMessage: error instanceof Error ? error.message : '下载失败',
          });
        }
      }),
    );
  }

  exportCsv(): string {
    const records: CsvRecord[] = this.queue.list().map((task) => {
      return {
        id: task.id,
        prompt: task.input.prompt,
        imageUrl: task.input.imageUrl,
        ratio: task.input.ratio,
        seed: task.input.seed,
        watermark: task.input.watermark,
        callbackUrl: task.input.callbackUrl,
        translate: task.input.translate,
        extra: task.input.extra,
      };
    });

    return serializeVideoCsv(records);
  }

  getTasks(): BaseTask[] {
    return this.queue.list();
  }

  private createTaskFromCsv(record: CsvRecord): BaseTask {
    const input: SubmitPayload = {
      prompt: record.prompt,
      imageUrl: record.imageUrl,
      ratio: (record.ratio as SubmitPayload['ratio']) ?? (this.options.preset.defaultRatio as SubmitPayload['ratio']),
      seed: record.seed ?? (this.options.preset.defaultSeed as number | undefined),
      watermark: record.watermark ?? (this.options.preset.defaultWatermark as string | undefined),
      callbackUrl: record.callbackUrl ?? (this.options.preset.defaultCallback as string | undefined),
      translate:
        (record.translate as SubmitPayload['translate']) ??
        (this.options.preset.defaultTranslate as SubmitPayload['translate']),
      extra: {
        ...(record.extra ?? {}),
        preset: this.options.preset,
      },
    };

    const fingerprint = computeFingerprint(input);
    const now = Date.now();
    const task: BaseTask = {
      id: record.id || `task_${now}`,
      status: 'pending',
      progress: 0,
      input,
      providerRequestId: undefined,
      attempts: 0,
      maxAttempts: this.options.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      fingerprint,
    };
    return task;
  }
}
