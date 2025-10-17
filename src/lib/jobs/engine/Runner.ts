import pLimit from 'p-limit';
import { computeBackoffDelay, wait } from './Backoff';
import type { BaseTask } from '../types/job';
import type { VideoProvider } from '../types/provider';
import type { JobQueue } from './JobQueue';
import type { KeyPool } from './KeyPool';

export type RunnerOptions = {
  concurrency: number;
  maxAttempts: number;
  provider: VideoProvider;
  queue: JobQueue;
  keyPool: KeyPool;
};

export class Runner {
  private readonly limit: ReturnType<typeof pLimit>;

  constructor(private readonly options: RunnerOptions) {
    this.limit = pLimit(Math.max(1, options.concurrency));
  }

  async submitPendingTasks(): Promise<void> {
    const pending = this.options.queue
      .list()
      .filter((task) => task.status === 'pending' || task.status === 'failed');

    await Promise.all(
      pending.map((task) =>
        this.limit(() => this.submitTask(task).catch((error) => {
          console.error('[VideoRunner] 提交任务失败', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })),
      ),
    );
  }

  private async submitTask(task: BaseTask) {
    let attempt = task.attempts ?? 0;
    let lastError: Error | null = null;
    while (attempt < this.options.maxAttempts) {
      attempt += 1;
      const keyEntry = this.options.keyPool.pick();
      this.options.queue.update(task.id, { status: 'submitted', attempts: attempt });
      try {
        const { providerRequestId } = await this.options.provider.submitJob(task.input, keyEntry.apiKey);
        this.options.queue.update(task.id, {
          providerRequestId,
          status: 'running',
          attempts: attempt,
        });
        return;
      } catch (error) {
        lastError = error as Error;
        const delay = computeBackoffDelay(attempt);
        this.options.queue.update(task.id, {
          status: 'failed',
          errorMessage: lastError.message,
          errorCode: 'SUBMIT_ERROR',
          attempts: attempt,
        });
        if (attempt >= this.options.maxAttempts) {
          throw lastError;
        }
        await wait(delay);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }
}
