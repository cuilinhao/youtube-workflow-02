import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDefaultResultOrder, setServers } from 'node:dns';
import { Agent, ProxyAgent, request, setGlobalDispatcher } from 'undici';

function loadEnvCandidate(file) {
  const loader = process.loadEnvFile;
  if (typeof loader === 'function') {
    try {
      loader(file);
      return;
    } catch {
      // ignore; fall back to manual parsing below
    }
  }

  const absolute = resolve(file);
  if (!existsSync(absolute)) {
    return;
  }
  const content = readFileSync(absolute, 'utf8');
  content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const index = line.indexOf('=');
      if (index <= 0) return;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
}

loadEnvCandidate('.env.local');
loadEnvCandidate('.env');

setServers(['1.1.1.1', '1.0.0.1']);
setDefaultResultOrder('ipv4first');

const proxyUrl = process.env.ALL_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(
    new ProxyAgent({
      uri: proxyUrl,
      connect: { timeout: 8_000 },
    }),
  );
} else {
  setGlobalDispatcher(
    new Agent({
      pipelining: 0,
      connect: {
        family: 4,
        timeout: 8_000,
        tls: { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'] },
      },
    }),
  );
}

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const provider = process.env.TEST_VIDEO_PROVIDER ?? 'kie-veo3-fast';
const numbers = process.env.TEST_VIDEO_NUMBERS
  ? process.env.TEST_VIDEO_NUMBERS.split(',').map((value) => value.trim()).filter(Boolean)
  : undefined;

const payload = { provider, numbers };

console.log('[test] Starting video generation API test', {
  baseUrl,
  provider,
  numbers,
});

const start = Date.now();

try {
  const response = await request(`${baseUrl}/api/generate/videos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    // Video batch generation may take a few minutes, so disable both timeouts.
    bodyTimeout: 0,
    headersTimeout: 0,
  });

  const text = await response.body.text();
  const durationMs = Date.now() - start;
  console.log('[test] Response status:', response.statusCode);
  console.log('[test] Duration (ms):', durationMs);

  try {
    const data = JSON.parse(text);
    console.log('[test] Parsed response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[test] Failed to parse JSON response');
    console.error(text);
    throw error;
  }
} catch (error) {
  console.error('[test] Request failed:', error);
  process.exitCode = 1;
}
