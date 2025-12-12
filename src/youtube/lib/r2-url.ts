const rawBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const publicBaseUrl = rawBaseUrl ? rawBaseUrl.trim().replace(/\/$/, '') : '';

export function buildPublicUrl(key: string): string | null {
  if (!publicBaseUrl) return null;
  const safeKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${publicBaseUrl}/${safeKey}`;
}
