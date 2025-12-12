const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || '';
const R2_REQUIRED_PREFIX = 'uploads';

type PresignResp = { url: string; key: string; publicUrl?: string | null };
type GetUrlResp = { url: string };

function guessContentType(name: string, fallback = 'application/octet-stream') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return fallback;
}

export async function uploadBlobToR2(params: {
  blob: Blob;
  filename: string;
  prefix?: string;
  onProgress?: (v: number) => void;
}): Promise<{ key: string; url: string }> {
  const { blob, filename, prefix, onProgress } = params;
  const contentType =
    blob.type && blob.type !== 'application/octet-stream' ? blob.type : guessContentType(filename);

  const sanitizedPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : '';
  const keySegments = [R2_REQUIRED_PREFIX];
  if (sanitizedPrefix) {
    keySegments.push(sanitizedPrefix);
  }
  keySegments.push(filename);
  const key = keySegments.join('/');

  const presignResponse = await fetch('/api/youtube/r2/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType }),
  });
  if (!presignResponse.ok) {
    const text = await presignResponse.text();
    throw new Error(`[R2 presign] ${presignResponse.status} ${text || presignResponse.statusText}`);
  }
  const presignPayload = (await presignResponse.json()) as PresignResp;
  const uploadUrl = presignPayload.url;
  if (!uploadUrl) {
    throw new Error('[R2 presign] Missing signed upload URL');
  }

  onProgress?.(0);
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType },
  });
  if (!putResponse.ok) {
    const text = await putResponse.text();
    throw new Error(`[R2 put] ${putResponse.status} ${text || putResponse.statusText}`);
  }
  onProgress?.(100);

  if (R2_PUBLIC_BASE) {
    const base = R2_PUBLIC_BASE.replace(/\/+$/, '');
    return { key, url: `${base}/${encodeURI(key)}` };
  }

  if (presignPayload.publicUrl) {
    return { key, url: presignPayload.publicUrl };
  }

  const getUrlResponse = await fetch(`/api/r2/presign-get?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!getUrlResponse.ok) {
    const text = await getUrlResponse.text();
    throw new Error(
      `[R2 presign-get] ${getUrlResponse.status} ${text || getUrlResponse.statusText}`,
    );
  }
  const { url }: GetUrlResp = await getUrlResponse.json();
  return { key, url };
}

export async function ensureRemoteImageUrl(params: {
  inputUrl: string;
  filenameHint?: string;
  prefix?: string;
  onProgress?: (v: number) => void;
}): Promise<string> {
  const { inputUrl, filenameHint, prefix, onProgress } = params;

  if (/^https?:\/\//i.test(inputUrl)) {
    return inputUrl;
  }

  if (/^data:image\//i.test(inputUrl)) {
    const res = await fetch(inputUrl);
    const blob = await res.blob();
    const filename = filenameHint?.split('/').pop() || `image_${Date.now()}.png`;
    const { url } = await uploadBlobToR2({
      blob,
      filename,
      prefix,
      onProgress,
    });
    return url;
  }

  const normalized = inputUrl.startsWith('/') ? inputUrl : `/${inputUrl}`;
  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error(`[fetch local] ${normalized} -> ${response.status}`);
  }
  const blob = await response.blob();
  const filename =
    filenameHint?.split('/').pop() || normalized.split('/').pop() || `image_${Date.now()}.png`;
  const { url } = await uploadBlobToR2({
    blob,
    filename,
    prefix,
    onProgress,
  });
  return url;
}
