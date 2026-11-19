import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('sends the supplied session token to the API', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/me');
    assert.equal(options.headers.Authorization, 'Bearer session-token');
    return new Response(JSON.stringify({ memberships: [] }), { status: 200 });
  };

  assert.deepEqual(await api('/auth/me', { token: 'session-token' }), { memberships: [] });
});

test('surfaces an authentication failure', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });

  await assert.rejects(api('/auth/me', { token: 'session-token' }), /Not signed in/);
});
