#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import { URL } from 'node:url';

const PORT = 3000;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;
const PATHS = ['/', '/home', '/pricing', '/blog', '/terms', '/auth/login'];
const MAX_REDIRECTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpGet(pathname, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: pathname,
        timeout: 20_000,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          const next = new URL(res.headers.location, `http://127.0.0.1:${PORT}${pathname}`);
          res.resume();
          resolve(httpGet(next.pathname + next.search, redirectsLeft - 1));
          return;
        }

        if (status !== 200) {
          res.resume();
          reject(new Error(`Unexpected status for ${pathname}: ${status}`));
          return;
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}

async function waitForPath(pathname) {
  const start = Date.now();
  while (true) {
    if (Date.now() - start > READY_TIMEOUT_MS) {
      throw new Error(`Path did not respond in time: ${pathname}`);
    }
    try {
      return await httpGet(pathname);
    } catch {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function main() {
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const dev = spawn(pnpmCmd, ['dev'], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dev.stdout.on('data', (chunk) => process.stdout.write(`[dev] ${chunk}`));
  dev.stderr.on('data', (chunk) => process.stderr.write(`[dev-err] ${chunk}`));

  let exited = false;
  const waitForExit = new Promise((resolve) => {
    dev.on('exit', (code) => {
      exited = true;
      if (code !== 0) {
        process.exitCode = code ?? 1;
      }
      resolve();
    });
  });

  try {
    const rootHtml = await waitForPath('/');
    console.log(`\n[smoke] GET http://localhost:${PORT}/ OK (${rootHtml.length} chars)\n`);
    for (const pathname of PATHS.slice(1)) {
      const html = await waitForPath(pathname);
      console.log(`[smoke] GET http://localhost:${PORT}${pathname} OK (${html.length} chars)`);
    }
    console.log('');
  } catch (error) {
    console.error(`[smoke] Failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (!exited) {
      dev.kill('SIGINT');
      await Promise.race([waitForExit, sleep(5_000)]);
      if (!exited) dev.kill('SIGKILL');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
