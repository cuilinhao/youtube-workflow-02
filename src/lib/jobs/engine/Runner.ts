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
  batchDelayMs?: number;
};

// Provider error responses are inconsistent, so we try to match common 429 signatures.
const RATE_LIMIT_PATTERNS = [/"code"\s*[:=]\s*429/i, /\bHTTP\s*429\b/i, /call frequency is too high/i];
const DEFAULT_RATE_LIMIT_DELAY = 30_000;

export class Runner {
  private readonly limit: ReturnType<typeof pLimit>;

  private readonly concurrency: number;

  private readonly batchDelayMs: number;

  constructor(private readonly options: RunnerOptions) {
    this.concurrency = Math.max(1, options.concurrency);
    this.batchDelayMs = Math.max(0, options.batchDelayMs ?? 0);
    this.limit = pLimit(this.concurrency);
  }

  async submitPendingTasks(): Promise<void> {
    const pending = this.options.queue
      .list()
      .filter((task) => task.status === 'pending' || task.status === 'failed');

    if (!pending.length) {
      return;
    }

    const batchSize = this.concurrency;

    for (let index = 0; index < pending.length; index += batchSize) {
      const batch = pending.slice(index, index + batchSize);

      // Limit within the batch to preserve concurrency but still gate overall throughput.
      await Promise.all(
        batch.map((task) =>
          this.limit(() =>
            this.submitTask(task).catch((error) => {
              console.error('[VideoRunner] 提交任务失败', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }),
          ),
        ),
      );

      const hasNextBatch = index + batch.length < pending.length;
      if (hasNextBatch && this.batchDelayMs > 0) {
        // Introduce a pause between batches to avoid spiking provider rate limits.
        console.info('[VideoRunner] 批次提交完成，等待重试窗口', {
          delayMs: this.batchDelayMs,
          nextBatchStartsAt: new Date(Date.now() + this.batchDelayMs).toISOString(),
        });
        await wait(this.batchDelayMs);
      }
    }
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
        const isRateLimit = this.isRateLimitError(error);
        const delay = isRateLimit
          ? Math.max(this.batchDelayMs, DEFAULT_RATE_LIMIT_DELAY)
          : computeBackoffDelay(attempt);
        this.options.queue.update(task.id, {
          status: 'failed',
          errorMessage: lastError.message,
          errorCode: isRateLimit ? 'RATE_LIMIT' : 'SUBMIT_ERROR',
          attempts: attempt,
        });
        if (attempt >= this.options.maxAttempts) {
          throw lastError;
        }
        if (isRateLimit) {
          // Sharing the longer delay via logs helps explain slower retry cadence.
          console.warn('[VideoRunner] 提交任务触发限流，等待后重试', {
            taskId: task.id,
            delayMs: delay,
          });
        }
        await wait(delay);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error) return false;
    const message = error instanceof Error ? error.message : String(error);
    return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
  }
}
