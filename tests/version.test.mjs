import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, createUpdateWatcher } from '../web/version.js';

function watcher({ live = 'new', idle = true, storage = new Map() } = {}) {
  const calls = { reloads: 0, notices: [] };
  const store = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const updates = createUpdateWatcher({ revision: 'old', idle: () => idle, storage: store,
    reload: () => { calls.reloads++; }, notify: revision => calls.notices.push(revision),
    fetchRevision: async () => { if (live instanceof Error) throw live; return live; } });
  return { updates, calls, storage };
}

test('an unbuilt page never looks for releases', () => {
  assert.equal(BUILD.revision, 'dev');
});

test('the live release leaves the page alone', async () => {
  const { updates, calls } = watcher({ live: 'old' });
  assert.equal(await updates.check('boot'), 'current');
  assert.deepEqual(calls, { reloads: 0, notices: [] });
});

test('an idle page reopened on an old release reloads once per release', async () => {
  const { updates, calls, storage } = watcher();
  assert.equal(await updates.check('boot'), 'reloading');
  assert.equal(calls.reloads, 1);
  // The reloaded page still came back old (stale CDN copy): it shows the note instead of looping.
  const again = watcher({ storage });
  assert.equal(await again.updates.check('boot'), 'outdated');
  assert.equal(again.calls.reloads, 0);
  assert.deepEqual(again.calls.notices, ['new']);
});

test('a page in use only shows the note, once per release', async () => {
  const busy = watcher({ idle: false });
  assert.equal(await busy.updates.check('return'), 'outdated');
  assert.equal(await busy.updates.check('poll'), 'outdated');
  assert.deepEqual(busy.calls, { reloads: 0, notices: ['new'] });
  // An idle page that is merely being looked at does not reload under the player either.
  const idle = watcher();
  assert.equal(await idle.updates.check('visible'), 'outdated');
  assert.equal(idle.calls.reloads, 0);
});

test('offline, nothing happens', async () => {
  const { updates, calls } = watcher({ live: new Error('offline') });
  assert.equal(await updates.check('boot'), 'unknown');
  assert.deepEqual(calls, { reloads: 0, notices: [] });
});
