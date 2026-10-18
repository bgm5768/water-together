import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('repeated pushes alert again, survive bodyless payloads and only sound in one visible app', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const shown: { title: string; options: any }[] = [];
  const messages: unknown[] = [];
  const scope = 'https://example.com/water-together/';
  runInNewContext(readFileSync('frontend/src/sw.js', 'utf8'), {
    URL,
    __PRECACHE__: [],
    __REVISION__: 'test',
    self: {
      registration: {
        scope,
        showNotification: async (title: string, options: unknown) => {
          shown.push({ title, options });
        },
      },
      addEventListener: (type: string, fn: (event: any) => void) => {
        handlers[type] = fn;
      },
      clients: {
        matchAll: async () => [
          {
            url: scope,
            visibilityState: 'hidden',
            postMessage: () => assert.fail('hidden tab must not play'),
          },
          {
            url: 'https://example.com/unrelated/',
            visibilityState: 'visible',
            postMessage: () => assert.fail('other app must not play'),
          },
          {
            url: scope,
            visibilityState: 'visible',
            postMessage: (data: unknown) => messages.push(data),
          },
          {
            url: scope,
            visibilityState: 'visible',
            postMessage: () => assert.fail('must not play twice'),
          },
        ],
      },
    },
  });
  for (const data of [
    { json: () => ({ title: '이번에는 약 286 ml 💧', body: '물 마실 시간' }) },
    {
      json: () => {
        throw new Error('old empty push');
      },
    },
  ]) {
    let completion: Promise<void> | undefined;
    handlers.push({
      data,
      waitUntil: (promise: Promise<void>) => {
        completion = promise;
      },
    });
    await completion;
  }
  assert.equal(shown.length, 2);
  assert.equal(shown[0].title, '이번에는 약 286 ml 💧');
  assert.equal(shown[1].title, '물 마실 시간이에요 💧');
  for (const { options } of shown) {
    assert.equal(options.renotify, true);
    assert.equal(options.silent, false);
    assert.equal(options.tag, 'water-reminder');
    assert.equal(options.data.url, scope);
    assert.ok(options.vibrate.length > 0);
  }
  assert.equal(messages.length, 2);
});
