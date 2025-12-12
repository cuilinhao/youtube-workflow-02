export function computeBackoffDelay(attempt: number, base = 200, factor = 1.6, max = 5000): number {
  if (attempt <= 0) {
    return base;
  }
  const delay = base * Math.pow(factor, attempt - 1);
  return Math.min(Math.round(delay), max);
}

export async function wait(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
