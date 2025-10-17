import { setDefaultResultOrder, setServers } from 'node:dns';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';

// Enforce Cloudflare DNS for this Node.js process only.
setServers(['1.1.1.1', '1.0.0.1']);

// Prefer IPv4 when resolving hostnames to avoid IPv6-only routes.
setDefaultResultOrder('ipv4first');

const proxyUrl = process.env.ALL_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;

if (proxyUrl) {
  setGlobalDispatcher(
    new ProxyAgent({
      uri: proxyUrl,
      connect: {
        timeout: 8_000,
      },
    }),
  );
} else {
  setGlobalDispatcher(
    new Agent({
      pipelining: 0,
      connect: {
        family: 4,
        timeout: 8_000,
        tls: {
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.3',
          ALPNProtocols: ['http/1.1'],
        },
      },
    }),
  );
}
