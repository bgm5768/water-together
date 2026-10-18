// This entry is bundled ONLY by tests. Production always uses src/index.ts.
import app from '../src/index';
import { scheduled } from '../src/scheduler';
import type { Env } from '../src/models';

// Miniflare's fetchMock transport converts a thrown upstream error into HTTP 500.
// Inject a rejected fetch inside workerd to test the actual ambiguous-network branch.
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === 'https://fcm.googleapis.com/fcm/send/ambiguous') {
    return Promise.reject(new TypeError('Simulated connection reset'));
  }
  return originalFetch(input, init);
}) as typeof fetch;

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === '/__test/cron') {
      await scheduled(env, Number(url.searchParams.get('now')));
      return new Response('ok');
    }
    const pending: Promise<unknown>[] = [];
    const response = await app.fetch(req, env, {
      waitUntil(promise) {
        pending.push(promise);
      },
    });
    await Promise.all(pending);
    return response;
  },
} satisfies ExportedHandler<Env>;
