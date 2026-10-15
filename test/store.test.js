// -----------------------------------------------------------------------------
// /data/myskoda.json: the session and the per-car memory, written with mode
// 0600 and atomically; a fingerprint of the credentials, never the password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';

const credentials = { email: 'Driver@Example.com', password: 'secret password' };

test('the session is saved at once, mode 0600, without the password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myskoda-'));
  try {
    const store = createStore({ dir, debounceMs: 10 });
    await store.load();
    const session = store.sessionStore(store.fingerprint(credentials));
    session.set({ accessToken: 'a', refreshToken: 'r' });
    await store.flush();
    const file = join(dir, 'myskoda.json');
    const text = await readFile(file, 'utf8');
    assert.ok(!text.includes('secret password'));
    assert.ok(!text.toLowerCase().includes('driver@example.com'));
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(dir), ['myskoda.json'], 'no temporary file left');

    // A restart reads it back; other credentials start from an empty session.
    const again = createStore({ dir });
    await again.load();
    assert.equal(again.sessionStore(again.fingerprint(credentials)).get().refreshToken, 'r');
    const other = again.sessionStore(again.fingerprint({ ...credentials, password: 'other' }));
    assert.equal(other.get().refreshToken, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unreadable file is ignored, with one warning', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myskoda-'));
  try {
    await writeFile(join(dir, 'myskoda.json'), '{ not json');
    const warnings = [];
    const store = createStore({ dir, logger: { warn: (line) => warnings.push(line) } });
    const data = await store.load();
    assert.deepEqual(data.vehicles, {});
    assert.equal(warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
