export const videoCsvColumns = [
  'id',
  'prompt',
  'image_url',
  'ratio',
  'seed',
  'watermark',
  'callback_url',
  'translate',
  'fallback_model',
  'note',
] as const;

export type VideoCsvColumn = (typeof videoCsvColumns)[number];

const columnAliasMap: Record<string, VideoCsvColumn> = {
  imageUrl: 'image_url',
  image: 'image_url',
  ratio: 'ratio',
  aspect_ratio: 'ratio',
  aspectRatio: 'ratio',
  seed: 'seed',
  watermark: 'watermark',
  callback: 'callback_url',
  callbackUrl: 'callback_url',
  translate: 'translate',
  fallback: 'fallback_model',
};

export function normalizeVideoCsvHeader(header: string): VideoCsvColumn | null {
  const normalized = header.trim().toLowerCase();
  if (videoCsvColumns.includes(normalized as VideoCsvColumn)) {
    return normalized as VideoCsvColumn;
  }
  const alias = columnAliasMap[header] ?? columnAliasMap[normalized];
  if (alias) {
    return alias;
  }
  return null;
}
