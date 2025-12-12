import { createHash } from 'node:crypto';
import type { SubmitPayload } from '../types/provider';

export function computeFingerprint(input: SubmitPayload): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    prompt: input.prompt,
    imageUrl: input.imageUrl ?? '',
    ratio: input.ratio ?? '',
    seed: input.seed ?? '',
    watermark: input.watermark ?? '',
    callbackUrl: input.callbackUrl ?? '',
    translate: input.translate ?? '',
    extra: input.extra ?? {},
  }));
  return hash.digest('hex');
}
