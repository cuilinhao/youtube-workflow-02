import { wait } from './Backoff';
import type { VideoProvider } from '../types/provider';
import type { JobQueue } from './JobQueue';
import type { KeyPool } from './KeyPool';
import type { BaseTask } from '../types/job';

export type PollerOptions = {
  provider: VideoProvider;
  queue: JobQueue;
  keyPool: KeyPool;
  intervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_INTERVAL = 5000;
const DEFAULT_TIMEOUT = 30 * 60 * 1000;

export class Poller {
  private readonly interval: number;

  private readonly timeout: number;

  constructor(private readonly options: PollerOptions) {
    this.interval = options.intervalMs ?? DEFAULT_INTERVAL;
    this.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  async pollUntilComplete(): Promise<void> {
    const start = Date.now();
    while (true) {
      const running = this.options.queue
        .list()
        .filter((task) => task.status === 'running' || task.status === 'submitted');

      if (!running.length) {
        return;
      }

      await Promise.all(
        running.map((task) => this.pollSingle(task).catch((error) => {
          console.error('[VideoPoller] 轮询任务失败', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })),
      );

      const rest = this.options.queue.list().filter((task) => task.status === 'running').length;
      if (rest === 0) {
        return;
      }

      if (Date.now() - start > this.timeout) {
        this.options.queue.list().forEach((task) => {
          if (task.status === 'running') {
            this.options.queue.update(task.id, {
              status: 'timeout',
              errorCode: 'TIMEOUT',
              errorMessage: '轮询超时',
            });
          }
        });
        return;
      }

      await wait(this.interval);
    }
  }

  private async pollSingle(task: BaseTask): Promise<void> {
    if (!task.providerRequestId) return;
    const keyEntry = this.options.keyPool.peek();
    const result = await this.options.provider.queryJob(task.providerRequestId, keyEntry.apiKey);

    switch (result.status) {
      case 'queued':
      case 'running':
        this.options.queue.update(task.id, {
          status: 'running',
          progress: result.progress ?? task.progress,
        });
        break;
      case 'failed':
        this.options.queue.update(task.id, {
          status: 'failed',
          progress: result.progress ?? 0,
          errorCode: result.errorCode ?? 'PROVIDER_ERROR',
          errorMessage: result.errorMessage ?? '视频生成失败',
        });
        break;
      case 'succeeded':
        this.options.queue.update(task.id, {
          status: 'succeeded',
          progress: 1,
          resultUrl: result.resultUrl ?? undefined,
        });
        break;
      default:
        break;
    }
  }
}
