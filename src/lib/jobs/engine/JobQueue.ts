import type { BaseTask } from '../types/job';

type UpdateListener = (task: BaseTask) => void | Promise<void>;

export class JobQueue {
  constructor(private readonly onUpdate?: UpdateListener) {}

  private tasks = new Map<string, BaseTask>();

  enqueue(entries: BaseTask[]) {
    entries.forEach((task) => {
      this.tasks.set(task.id, task);
    });
  }

  list(): BaseTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  update(taskId: string, patch: Partial<BaseTask>) {
    const current = this.tasks.get(taskId);
    if (!current) return;
    this.tasks.set(taskId, {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });
    void this.dispatchUpdate(taskId);
  }

  findByFingerprint(fingerprint: string): BaseTask | undefined {
    return this.list().find((task) => task.fingerprint === fingerprint);
  }

  private async dispatchUpdate(taskId: string) {
    if (!this.onUpdate) return;
    const task = this.tasks.get(taskId);
    if (!task) return;
    await this.onUpdate(task);
  }
}
