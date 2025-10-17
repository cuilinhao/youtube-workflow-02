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
      // fall back to manual parsing
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

// Align network behaviour with server runtime.
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

const apiKey = process.env.KIE_API_KEY;
if (!apiKey) {
  console.error('❌ No KIE_API_KEY found. Please set it in .env.local');
  process.exit(1);
}

const body = {
  prompt: 'test from node script',
  imageUrls: [
    'https://pub-0e00591269e142acabd1ae9ac18c8d65.r2.dev/uploads/video-references/1760711310851/test-aa.png',
  ],
  model: 'veo3_fast',
  aspectRatio: '16:9',
  enableTranslation: true,
  enableFallback: false,
};

const { statusCode, body: responseBody } = await request('https://api.kie.ai/api/v1/veo/generate', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify(body),
  bodyTimeout: 25_000,
  headersTimeout: 25_000,
});

const text = await responseBody.text();

console.log('status:', statusCode);
console.log('body:', text);
