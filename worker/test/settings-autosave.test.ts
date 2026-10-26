import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsAutosave } from '../../frontend/src/settings-autosave';
import { defaults, type Settings } from '../../shared/types';

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

test('settings edits are batched until navigation and survive a reload', async () => {
  const store = memoryStore();
  const sent: Settings[] = [];
  const first = new SettingsAutosave(
    store,
    async (settings) => {
      sent.push(settings);
      return settings;
    },
    () => {},
    () => {},
  );
  first.acceptServer('user-a', defaults);
  first.update({ ...defaults, daily_goal_ml: 2100 });
  first.update({ ...defaults, daily_goal_ml: 2200, enabled: false });
  assert.equal(sent.length, 0);
  assert.equal(store.values.size, 1);

  const reopened = new SettingsAutosave(
    store,
    async (settings) => {
      sent.push(settings);
      return settings;
    },
    () => {},
    () => {},
  );
  assert.equal(reopened.acceptServer('user-a', defaults).daily_goal_ml, 2200);
  assert.equal(await reopened.flush(), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].enabled, false);
  assert.equal(store.values.size, 0);
});

test('a newer edit waits for an in-flight save and wins', async () => {
  const store = memoryStore();
  const sent: Settings[] = [];
  let finishFirst!: (settings: Settings) => void;
  const firstResponse = new Promise<Settings>((resolve) => {
    finishFirst = resolve;
  });
  const saver = new SettingsAutosave(
    store,
    (settings) => {
      sent.push(settings);
      return sent.length === 1 ? firstResponse : Promise.resolve(settings);
    },
    () => {},
    () => {},
  );
  saver.acceptServer('user-a', defaults);
  saver.update({ ...defaults, daily_goal_ml: 2100 });
  const flush = saver.flush();
  saver.update({ ...defaults, daily_goal_ml: 2200 });
  assert.equal(sent.length, 1);
  finishFirst(sent[0]);
  assert.equal(await flush, true);
  assert.deepEqual(
    sent.map((settings) => settings.daily_goal_ml),
    [2100, 2200],
  );
  assert.equal(store.values.size, 0);
});

test('reverting a value while its earlier save is in flight saves the reversion', async () => {
  const store = memoryStore();
  const sent: Settings[] = [];
  let finishFirst!: (settings: Settings) => void;
  const firstResponse = new Promise<Settings>((resolve) => {
    finishFirst = resolve;
  });
  const saver = new SettingsAutosave(
    store,
    (settings) => {
      sent.push(settings);
      return sent.length === 1 ? firstResponse : Promise.resolve(settings);
    },
    () => {},
    () => {},
  );
  saver.acceptServer('user-a', defaults);
  saver.update({ ...defaults, enabled: false });
  const flush = saver.flush();
  saver.update(defaults);
  assert.equal(store.values.size, 1);
  finishFirst(sent[0]);
  assert.equal(await flush, true);
  assert.deepEqual(
    sent.map((settings) => settings.enabled),
    [false, true],
  );
  assert.equal(store.values.size, 0);
});

test('a failed save keeps the draft for a later retry', async () => {
  const store = memoryStore();
  let fail = true;
  const saver = new SettingsAutosave(
    store,
    async (settings) => {
      if (fail) throw new Error('offline');
      return settings;
    },
    () => {},
    () => {},
  );
  saver.acceptServer('user-a', defaults);
  saver.update({ ...defaults, daily_goal_ml: 2100 });
  assert.equal(await saver.flush(), false);
  assert.equal(store.values.size, 1);
  fail = false;
  assert.equal(await saver.flush(), true);
  assert.equal(store.values.size, 0);
});
